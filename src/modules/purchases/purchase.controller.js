const pool = require('../../config/db');

const round2 = (value) => Number(Number(value).toFixed(2));
const { createAuditLog } = require('../../utils/audit.helper');

const generateBillNo = async (client) => {
  const result = await client.query(
    'SELECT id FROM purchase_bills ORDER BY id DESC LIMIT 1'
  );

  const lastId = result.rows.length > 0 ? result.rows[0].id : 0;
  const nextId = lastId + 1;

  return `BILL-${String(nextId).padStart(5, '0')}`;
};

const getSupplierRunningBalance = async (client, supplierId) => {
  const result = await client.query(
    `SELECT balance
     FROM supplier_ledger
     WHERE supplier_id = $1
     ORDER BY id DESC
     LIMIT 1`,
    [supplierId]
  );

  if (result.rows.length === 0) return 0;
  return Number(result.rows[0].balance || 0);
};

const createPurchaseBill = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      supplier_id,
      bill_date,
      discount_amount = 0,
      paid_amount = 0,
      notes = null,
      items,
    } = req.body;

    if (!supplier_id) {
      return res.status(400).json({
        success: false,
        message: 'Supplier is required',
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one purchase item is required',
      });
    }

    await client.query('BEGIN');

    const supplierResult = await client.query(
      'SELECT * FROM suppliers WHERE id = $1',
      [supplier_id]
    );

    if (supplierResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Supplier not found',
      });
    }

    let subtotal = 0;
    let totalTax = 0;
    const preparedItems = [];

    for (const item of items) {
      const { product_id, quantity, unit_cost } = item;

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
      const cost = Number(unit_cost ?? product.purchase_price ?? 0);
      const taxPercent = Number(product.tax_percent || 0);

      const lineBase = round2(qty * cost);
      const lineTax = round2((lineBase * taxPercent) / 100);
      const lineTotal = round2(lineBase + lineTax);

      subtotal += lineBase;
      totalTax += lineTax;

      preparedItems.push({
        product_id,
        quantity: qty,
        unit_cost: cost,
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

    const billNo = await generateBillNo(client);

    const billResult = await client.query(
      `INSERT INTO purchase_bills (
        bill_no,
        supplier_id,
        bill_date,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        paid_amount,
        due_amount,
        notes,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        billNo,
        supplier_id,
        bill_date || new Date(),
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

    const bill = billResult.rows[0];

    for (const item of preparedItems) {
      await client.query(
        `INSERT INTO purchase_bill_items (
          bill_id,
          product_id,
          quantity,
          unit_cost,
          tax_percent,
          tax_amount,
          line_total
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          bill.id,
          item.product_id,
          item.quantity,
          item.unit_cost,
          item.tax_percent,
          item.tax_amount,
          item.line_total,
        ]
      );

      const newStock = round2(item.current_stock + item.quantity);

      await client.query(
        `UPDATE products
         SET current_stock = $1,
             purchase_price = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [newStock, item.unit_cost, item.product_id]
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
          'PURCHASE_IN',
          'PURCHASE_BILL',
          bill.id,
          item.quantity,
          0,
          newStock,
          `Purchase bill ${bill.bill_no}`,
        ]
      );
    }

    const previousBalance = await getSupplierRunningBalance(client, supplier_id);
    const newBalance = round2(previousBalance + totalAmount - paid);

    await client.query(
      `INSERT INTO supplier_ledger (
        supplier_id,
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
        supplier_id,
        bill_date || new Date(),
        'PURCHASE_BILL',
        bill.id,
        totalAmount,
        paid,
        newBalance,
        `Purchase bill ${bill.bill_no}`,
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'CREATE',
      module_name: 'PURCHASE_BILL',
      record_id: purchaseBill.id,
      description: `Created purchase bill ${purchaseBill.bill_no}`,
      metadata: {
        bill_no: purchaseBill.bill_no,
        supplier_id: purchaseBill.supplier_id,
        total_amount: purchaseBill.total_amount,
      },
      client,
    });

    res.status(201).json({
      success: true,
      message: 'Purchase bill created successfully',
      data: {
        bill,
        items: preparedItems,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create purchase bill error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create purchase bill',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const getAllPurchaseBills = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pb.*, s.supplier_name
       FROM purchase_bills pb
       JOIN suppliers s ON s.id = pb.supplier_id
       ORDER BY pb.id DESC`
    );

    res.json({
      success: true,
      message: 'Purchase bills fetched successfully',
      data: result.rows,
    });
  } catch (error) {
    console.error('Get purchase bills error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchase bills',
      error: error.message,
    });
  }
};

const getPurchaseBillById = async (req, res) => {
  try {
    const { id } = req.params;

    const billResult = await pool.query(
      `SELECT pb.*, s.supplier_name, s.supplier_code, s.phone, s.address
       FROM purchase_bills pb
       JOIN suppliers s ON s.id = pb.supplier_id
       WHERE pb.id = $1`,
      [id]
    );

    if (billResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Purchase bill not found',
      });
    }

    const itemsResult = await pool.query(
      `SELECT pbi.*, p.title, p.product_code
       FROM purchase_bill_items pbi
       JOIN products p ON p.id = pbi.product_id
       WHERE pbi.bill_id = $1
       ORDER BY pbi.id ASC`,
      [id]
    );

    res.json({
      success: true,
      message: 'Purchase bill fetched successfully',
      data: {
        bill: billResult.rows[0],
        items: itemsResult.rows,
      },
    });
  } catch (error) {
    console.error('Get purchase bill by id error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchase bill',
      error: error.message,
    });
  }
};

const cancelPurchaseBill = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const billResult = await client.query(
      `SELECT *
       FROM purchase_bills
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (billResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Purchase bill not found',
      });
    }

    const bill = billResult.rows[0];

    if (bill.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Purchase bill is already cancelled',
      });
    }

    const itemsResult = await client.query(
      `SELECT pbi.*, p.current_stock, p.title, p.product_code
       FROM purchase_bill_items pbi
       JOIN products p ON p.id = pbi.product_id
       WHERE pbi.bill_id = $1`,
      [id]
    );

    for (const item of itemsResult.rows) {
      const qty = Number(item.quantity || 0);
      const currentStock = Number(item.current_stock || 0);

      if (currentStock < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Cannot cancel purchase bill because stock for product ${item.product_code} is already used`,
        });
      }

      const newStock = round2(currentStock - qty);

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
          'PURCHASE_CANCEL_REVERSAL',
          'PURCHASE_BILL_CANCEL',
          bill.id,
          0,
          qty,
          newStock,
          `Purchase bill cancelled: ${bill.bill_no}`,
          req.user?.id || null,
        ]
      );
    }

    const lastLedgerResult = await client.query(
      `SELECT balance
       FROM supplier_ledger
       WHERE supplier_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [bill.supplier_id]
    );

    const previousBalance =
      lastLedgerResult.rows.length > 0
        ? Number(lastLedgerResult.rows[0].balance || 0)
        : 0;

    const billTotal = Number(bill.total_amount || 0);
    const newBalance = round2(previousBalance - billTotal);

    await client.query(
      `INSERT INTO supplier_ledger (
        supplier_id,
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
        bill.supplier_id,
        new Date(),
        'PURCHASE_BILL_CANCEL',
        bill.id,
        0,
        billTotal,
        newBalance,
        `Cancelled purchase bill ${bill.bill_no}`,
        req.user?.id || null,
      ]
    );

    await client.query(
      `UPDATE purchase_bills
       SET status = 'CANCELLED',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT'); await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'CANCEL',
      module_name: 'PURCHASE_BILL',
      record_id: bill.id,
      description: `Cancelled purchase bill ${bill.bill_no}`,
      metadata: {
        bill_no: bill.bill_no,
        supplier_id: bill.supplier_id,
        total_amount: bill.total_amount,
      },
      client,
    });


    res.json({
      success: true,
      message: 'Purchase bill cancelled successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cancel purchase bill error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel purchase bill',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  createPurchaseBill,
  getAllPurchaseBills,
  getPurchaseBillById,
  cancelPurchaseBill,
};