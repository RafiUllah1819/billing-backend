const pool = require('../../config/db');

const round2 = (value) => Number(Number(value).toFixed(2));

const generateReturnNo = async (client, tableName, prefix) => {
  const result = await client.query(
    `SELECT id FROM ${tableName} ORDER BY id DESC LIMIT 1`
  );

  const lastId = result.rows.length > 0 ? result.rows[0].id : 0;
  const nextId = lastId + 1;

  return `${prefix}-${String(nextId).padStart(5, '0')}`;
};

const receiveSalesReturn = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      invoice_id,
      customer_id,
      return_date,
      remarks,
      items,
    } = req.body;

    if (!invoice_id || !customer_id) {
      return res.status(400).json({
        success: false,
        message: 'Invoice and customer are required',
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one return item is required',
      });
    }

    await client.query('BEGIN');

    const invoiceResult = await client.query(
      `SELECT * FROM sales_invoices WHERE id = $1 LIMIT 1`,
      [invoice_id]
    );

    if (invoiceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Invoice not found',
      });
    }

    const returnNo = await generateReturnNo(client, 'sales_returns', 'SRET');

    let subtotal = 0;
    let taxAmount = 0;
    const preparedItems = [];

    for (const item of items) {
      const { product_id, quantity } = item;

      if (!product_id || !quantity || Number(quantity) <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Each return item must have valid product_id and quantity',
        });
      }

      const invoiceItemResult = await client.query(
        `SELECT sii.*, p.title, p.product_code, p.current_stock
         FROM sales_invoice_items sii
         JOIN products p ON p.id = sii.product_id
         WHERE sii.invoice_id = $1 AND sii.product_id = $2
         LIMIT 1`,
        [invoice_id, product_id]
      );

      if (invoiceItemResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Product ${product_id} not found in selected invoice`,
        });
      }

      const row = invoiceItemResult.rows[0];
      const qty = Number(quantity);
      const unitPrice = Number(row.unit_price || 0);
      const taxPercent = Number(row.tax_percent || 0);
      const lineBase = round2(qty * unitPrice);
      const lineTax = round2((lineBase * taxPercent) / 100);
      const lineTotal = round2(lineBase + lineTax);

      subtotal += lineBase;
      taxAmount += lineTax;

      preparedItems.push({
        product_id,
        quantity: qty,
        unit_price: unitPrice,
        tax_percent: taxPercent,
        tax_amount: lineTax,
        line_total: lineTotal,
        current_stock: Number(row.current_stock || 0),
      });
    }

    subtotal = round2(subtotal);
    taxAmount = round2(taxAmount);
    const totalAmount = round2(subtotal + taxAmount);

    const salesReturnResult = await client.query(
      `INSERT INTO sales_returns (
        return_no, invoice_id, customer_id, return_date, subtotal, tax_amount, total_amount, remarks, created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        returnNo,
        invoice_id,
        customer_id,
        return_date || new Date(),
        subtotal,
        taxAmount,
        totalAmount,
        remarks || null,
        req.user?.id || null,
      ]
    );

    const salesReturn = salesReturnResult.rows[0];

    for (const item of preparedItems) {
      await client.query(
        `INSERT INTO sales_return_items (
          sales_return_id, product_id, quantity, unit_price, tax_percent, tax_amount, line_total
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          salesReturn.id,
          item.product_id,
          item.quantity,
          item.unit_price,
          item.tax_percent,
          item.tax_amount,
          item.line_total,
        ]
      );

      const newStock = round2(item.current_stock + item.quantity);

      await client.query(
        `UPDATE products
         SET current_stock = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [newStock, item.product_id]
      );

      await client.query(
        `INSERT INTO stock_movements (
          product_id, movement_type, reference_type, reference_id,
          quantity_in, quantity_out, balance_after, remarks, created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          item.product_id,
          'SALES_RETURN_IN',
          'SALES_RETURN',
          salesReturn.id,
          item.quantity,
          0,
          newStock,
          `Sales return ${salesReturn.return_no}`,
          req.user?.id || null,
        ]
      );
    }

    const lastLedgerResult = await client.query(
      `SELECT balance FROM customer_ledger
       WHERE customer_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [customer_id]
    );

    const previousBalance =
      lastLedgerResult.rows.length > 0
        ? Number(lastLedgerResult.rows[0].balance || 0)
        : 0;

    const newBalance = round2(previousBalance - totalAmount);

    await client.query(
      `INSERT INTO customer_ledger (
        customer_id, entry_date, reference_type, reference_id,
        debit, credit, balance, remarks, created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        customer_id,
        return_date || new Date(),
        'SALES_RETURN',
        salesReturn.id,
        0,
        totalAmount,
        newBalance,
        remarks || `Sales return ${salesReturn.return_no}`,
        req.user?.id || null,
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Sales return recorded successfully',
      data: salesReturn,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Receive sales return error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to record sales return',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const issuePurchaseReturn = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      purchase_bill_id,
      supplier_id,
      return_date,
      remarks,
      items,
    } = req.body;

    if (!purchase_bill_id || !supplier_id) {
      return res.status(400).json({
        success: false,
        message: 'Purchase bill and supplier are required',
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one return item is required',
      });
    }

    await client.query('BEGIN');

    const billResult = await client.query(
      `SELECT * FROM purchase_bills WHERE id = $1 LIMIT 1`,
      [purchase_bill_id]
    );

    if (billResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Purchase bill not found',
      });
    }

    const returnNo = await generateReturnNo(client, 'purchase_returns', 'PRET');

    let subtotal = 0;
    let taxAmount = 0;
    const preparedItems = [];

    for (const item of items) {
      const { product_id, quantity } = item;

      if (!product_id || !quantity || Number(quantity) <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Each return item must have valid product_id and quantity',
        });
      }

      const purchaseItemResult = await client.query(
        `SELECT pbi.*, p.title, p.product_code, p.current_stock
         FROM purchase_bill_items pbi
         JOIN products p ON p.id = pbi.product_id
         WHERE pbi.bill_id = $1 AND pbi.product_id = $2
         LIMIT 1`,
        [purchase_bill_id, product_id]
      );

      if (purchaseItemResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Product ${product_id} not found in selected purchase bill`,
        });
      }

      const row = purchaseItemResult.rows[0];
      const qty = Number(quantity);
      const unitCost = Number(row.unit_cost || 0);
      const taxPercent = Number(row.tax_percent || 0);

      if (Number(row.current_stock || 0) < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Insufficient current stock for product ${product_id}`,
        });
      }

      const lineBase = round2(qty * unitCost);
      const lineTax = round2((lineBase * taxPercent) / 100);
      const lineTotal = round2(lineBase + lineTax);

      subtotal += lineBase;
      taxAmount += lineTax;

      preparedItems.push({
        product_id,
        quantity: qty,
        unit_cost: unitCost,
        tax_percent: taxPercent,
        tax_amount: lineTax,
        line_total: lineTotal,
        current_stock: Number(row.current_stock || 0),
      });
    }

    subtotal = round2(subtotal);
    taxAmount = round2(taxAmount);
    const totalAmount = round2(subtotal + taxAmount);

    const purchaseReturnResult = await client.query(
      `INSERT INTO purchase_returns (
        return_no, purchase_bill_id, supplier_id, return_date, subtotal, tax_amount, total_amount, remarks, created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        returnNo,
        purchase_bill_id,
        supplier_id,
        return_date || new Date(),
        subtotal,
        taxAmount,
        totalAmount,
        remarks || null,
        req.user?.id || null,
      ]
    );

    const purchaseReturn = purchaseReturnResult.rows[0];

    for (const item of preparedItems) {
      await client.query(
        `INSERT INTO purchase_return_items (
          purchase_return_id, product_id, quantity, unit_cost, tax_percent, tax_amount, line_total
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          purchaseReturn.id,
          item.product_id,
          item.quantity,
          item.unit_cost,
          item.tax_percent,
          item.tax_amount,
          item.line_total,
        ]
      );

      const newStock = round2(item.current_stock - item.quantity);

      await client.query(
        `UPDATE products
         SET current_stock = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [newStock, item.product_id]
      );

      await client.query(
        `INSERT INTO stock_movements (
          product_id, movement_type, reference_type, reference_id,
          quantity_in, quantity_out, balance_after, remarks, created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          item.product_id,
          'PURCHASE_RETURN_OUT',
          'PURCHASE_RETURN',
          purchaseReturn.id,
          0,
          item.quantity,
          newStock,
          `Purchase return ${purchaseReturn.return_no}`,
          req.user?.id || null,
        ]
      );
    }

    const lastLedgerResult = await client.query(
      `SELECT balance FROM supplier_ledger
       WHERE supplier_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [supplier_id]
    );

    const previousBalance =
      lastLedgerResult.rows.length > 0
        ? Number(lastLedgerResult.rows[0].balance || 0)
        : 0;

    const newBalance = round2(previousBalance - totalAmount);

    await client.query(
      `INSERT INTO supplier_ledger (
        supplier_id, entry_date, reference_type, reference_id,
        debit, credit, balance, remarks, created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        supplier_id,
        return_date || new Date(),
        'PURCHASE_RETURN',
        purchaseReturn.id,
        0,
        totalAmount,
        newBalance,
        remarks || `Purchase return ${purchaseReturn.return_no}`,
        req.user?.id || null,
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Purchase return recorded successfully',
      data: purchaseReturn,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Issue purchase return error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to record purchase return',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  receiveSalesReturn,
  issuePurchaseReturn,
};