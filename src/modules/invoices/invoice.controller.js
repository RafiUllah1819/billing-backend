const pool = require('../../config/db');

const round2 = (value) => Number(Number(value).toFixed(2));
const { createAuditLog } = require('../../utils/audit.helper');

const generateInvoiceNo = async (client) => {
  const result = await client.query(
    'SELECT id FROM sales_invoices ORDER BY id DESC LIMIT 1'
  );

  const lastId = result.rows.length > 0 ? result.rows[0].id : 0;
  const nextId = lastId + 1;

  return `INV-${String(nextId).padStart(5, '0')}`;
};

const getCustomerRunningBalance = async (client, customerId) => {
  const result = await client.query(
    `SELECT balance
     FROM customer_ledger
     WHERE customer_id = $1
     ORDER BY id DESC
     LIMIT 1`,
    [customerId]
  );

  if (result.rows.length === 0) return 0;
  return Number(result.rows[0].balance || 0);
};

const createInvoice = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      customer_id,
      invoice_date,
      invoice_type,
      discount_amount = 0,
      paid_amount = 0,
      notes = null,
      items,
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        message: 'Customer is required',
      });
    }

    if (!invoice_type || !['TAX', 'NON_TAX'].includes(invoice_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invoice type must be TAX or NON_TAX',
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one invoice item is required',
      });
    }

    await client.query('BEGIN');

    const customerResult = await client.query(
      'SELECT * FROM customers WHERE id = $1',
      [customer_id]
    );

    if (customerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    let subtotal = 0;
    let totalTax = 0;
    const preparedItems = [];

    for (const item of items) {
      const { product_id, quantity, unit_price } = item;

      if (!product_id || !quantity || Number(quantity) <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Each item must have valid product_id and quantity',
        });
      }

      const productResult = await client.query(
        'SELECT * FROM products WHERE id = $1',
        [product_id]
      );

      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: `Product not found for product_id ${product_id}`,
        });
      }

      const product = productResult.rows[0];
      const qty = Number(quantity);
      const price = Number(unit_price ?? product.sale_price);
      const taxPercent = invoice_type === 'TAX' ? Number(product.tax_percent || 0) : 0;

      if (Number(product.current_stock) < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product ${product.title}`,
        });
      }

      const lineBase = round2(qty * price);
      const lineTax = round2((lineBase * taxPercent) / 100);
      const lineTotal = round2(lineBase + lineTax);

      subtotal += lineBase;
      totalTax += lineTax;

      preparedItems.push({
        product_id,
        quantity: qty,
        unit_price: price,
        tax_percent: taxPercent,
        tax_amount: lineTax,
        line_total: lineTotal,
        current_stock: Number(product.current_stock),
        title: product.title,
      });
    }

    subtotal = round2(subtotal);
    totalTax = round2(totalTax);

    const discount = round2(Number(discount_amount || 0));
    const paid = round2(Number(paid_amount || 0));
    const totalAmount = round2(subtotal + totalTax - discount);
    const dueAmount = round2(totalAmount - paid);

    if (paid > totalAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Paid amount cannot be greater than total amount',
      });
    }

    const invoiceNo = await generateInvoiceNo(client);

    const invoiceResult = await client.query(
      `INSERT INTO sales_invoices (
        invoice_no,
        customer_id,
        invoice_date,
        invoice_type,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        paid_amount,
        due_amount,
        notes,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        invoiceNo,
        customer_id,
        invoice_date || new Date(),
        invoice_type,
        subtotal,
        totalTax,
        discount,
        totalAmount,
        paid,
        dueAmount,
        notes,
        'COMPLETED',
      ]
    );

    const invoice = invoiceResult.rows[0];

    for (const item of preparedItems) {
      await client.query(
        `INSERT INTO sales_invoice_items (
          invoice_id,
          product_id,
          quantity,
          unit_price,
          tax_percent,
          tax_amount,
          line_total
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          invoice.id,
          item.product_id,
          item.quantity,
          item.unit_price,
          item.tax_percent,
          item.tax_amount,
          item.line_total,
        ]
      );

      const newStock = round2(item.current_stock - item.quantity);

      await client.query(
        `UPDATE products
         SET current_stock = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [newStock, item.product_id]
      );

      await client.query(
        `INSERT INTO stock_movements (
          product_id,
          movement_type,
          reference_type,
          reference_id,
          quantity_in,
          quantity_out,
          balance_after,
          remarks
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          item.product_id,
          'SALE_OUT',
          'SALE_INVOICE',
          invoice.id,
          0,
          item.quantity,
          newStock,
          `Sale invoice ${invoice.invoice_no}`,
        ]
      );
    }

    const previousBalance = await getCustomerRunningBalance(client, customer_id);
    const newBalance = round2(previousBalance + totalAmount - paid);

    await client.query(
      `INSERT INTO customer_ledger (
        customer_id,
        entry_date,
        reference_type,
        reference_id,
        debit,
        credit,
        balance,
        remarks
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        customer_id,
        invoice_date || new Date(),
        'SALE_INVOICE',
        invoice.id,
        totalAmount,
        paid,
        newBalance,
        `Invoice ${invoice.invoice_no}`,
      ]
    );

    await client.query('COMMIT');

      await createAuditLog({
    user_id: req.user?.id || null,
    action_type: 'CREATE',
    module_name: 'SALES_INVOICE',
    record_id: invoice.id,
    description: `Created invoice ${invoice.invoice_no}`,
    metadata: {
      invoice_no: invoice.invoice_no,
      customer_id: invoice.customer_id,
      total_amount: invoice.total_amount,
    },
    client,
  });

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: {
        invoice,
        items: preparedItems,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create invoice error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create invoice',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const getAllInvoices = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT si.*, c.customer_name
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       ORDER BY si.id DESC`
    );

    res.json({
      success: true,
      message: 'Invoices fetched successfully',
      data: result.rows,
    });
  } catch (error) {
    console.error('Get invoices error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error.message,
    });
  }
};

const getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const invoiceResult = await pool.query(
        `SELECT 
      si.*, 
      c.customer_name, 
      c.customer_code, 
      c.phone, 
      c.address,

      s.company_name,
      s.company_address,
      s.company_phone,
      s.company_email,
      s.company_logo,
      s.currency_symbol

    FROM sales_invoices si
    JOIN customers c ON c.id = si.customer_id
    LEFT JOIN settings s ON s.id = 1
    WHERE si.id = $1`,
        [id]
    );
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found',
      });
    }

    const itemsResult = await pool.query(
      `SELECT sii.*, p.title, p.product_code
       FROM sales_invoice_items sii
       JOIN products p ON p.id = sii.product_id
       WHERE sii.invoice_id = $1
       ORDER BY sii.id ASC`,
      [id]
    );

    res.json({
      success: true,
      message: 'Invoice fetched successfully',
      data: {
        invoice: invoiceResult.rows[0],
        items: itemsResult.rows,
      },
    });
  } catch (error) {
    console.error('Get invoice by id error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice',
      error: error.message,
    });
  }
};

const cancelInvoice = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const invoiceResult = await client.query(
      `SELECT *
       FROM sales_invoices
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Invoice not found',
      });
    }

    const invoice = invoiceResult.rows[0];

    if (invoice.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Invoice is already cancelled',
      });
    }

    const itemsResult = await client.query(
      `SELECT sii.*, p.current_stock, p.title, p.product_code
       FROM sales_invoice_items sii
       JOIN products p ON p.id = sii.product_id
       WHERE sii.invoice_id = $1`,
      [id]
    );

    for (const item of itemsResult.rows) {
      const qty = Number(item.quantity || 0);
      const currentStock = Number(item.current_stock || 0);
      const newStock = round2(currentStock + qty);

      await client.query(
        `UPDATE products
         SET current_stock = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [newStock, item.product_id]
      );

      await client.query(
        `INSERT INTO stock_movements (
          product_id,
          movement_type,
          reference_type,
          reference_id,
          quantity_in,
          quantity_out,
          balance_after,
          remarks,
          created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          item.product_id,
          'INVOICE_CANCEL_REVERSAL',
          'SALES_INVOICE_CANCEL',
          invoice.id,
          qty,
          0,
          newStock,
          `Invoice cancelled: ${invoice.invoice_no}`,
          req.user?.id || null,
        ]
      );
    }

    const lastLedgerResult = await client.query(
      `SELECT balance
       FROM customer_ledger
       WHERE customer_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [invoice.customer_id]
    );

    const previousBalance =
      lastLedgerResult.rows.length > 0
        ? Number(lastLedgerResult.rows[0].balance || 0)
        : 0;

    const invoiceTotal = Number(invoice.total_amount || 0);
    const newBalance = round2(previousBalance - invoiceTotal);

    await client.query(
      `INSERT INTO customer_ledger (
        customer_id,
        entry_date,
        reference_type,
        reference_id,
        debit,
        credit,
        balance,
        remarks,
        created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        invoice.customer_id,
        new Date(),
        'SALES_INVOICE_CANCEL',
        invoice.id,
        0,
        invoiceTotal,
        newBalance,
        `Cancelled invoice ${invoice.invoice_no}`,
        req.user?.id || null,
      ]
    );

    await client.query(
      `UPDATE sales_invoices
       SET status = 'CANCELLED',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    await createAuditLog({
  user_id: req.user?.id || null,
  action_type: 'CANCEL',
  module_name: 'SALES_INVOICE',
  record_id: invoice.id,
  description: `Cancelled invoice ${invoice.invoice_no}`,
  metadata: {
    invoice_no: invoice.invoice_no,
    customer_id: invoice.customer_id,
    total_amount: invoice.total_amount,
  },
  client,
});

    res.json({
      success: true,
      message: 'Invoice cancelled successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cancel invoice error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel invoice',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  createInvoice,
  getAllInvoices,
  getInvoiceById,
  cancelInvoice,
};