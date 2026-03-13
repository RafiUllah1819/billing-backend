const pool = require('../../config/db');

const round2 = (value) => Number(Number(value).toFixed(2));
const { createAuditLog } = require('../../utils/audit.helper');

const createStockAdjustment = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      product_id,
      adjustment_type,
      quantity,
      reason,
      remarks,
    } = req.body;

    if (!product_id) {
      return res.status(400).json({
        success: false,
        message: 'Product is required',
      });
    }

    if (!adjustment_type || !['IN', 'OUT'].includes(adjustment_type)) {
      return res.status(400).json({
        success: false,
        message: 'Adjustment type must be IN or OUT',
      });
    }

    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid quantity is required',
      });
    }

    await client.query('BEGIN');

    const productResult = await client.query(
      `SELECT id, title, product_code, current_stock, is_active
       FROM products
       WHERE id = $1
       LIMIT 1`,
      [product_id]
    );

    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const product = productResult.rows[0];

    if (!product.is_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Cannot adjust an inactive product',
      });
    }

    const qty = round2(Number(quantity));
    const currentStock = round2(Number(product.current_stock || 0));

    let newStock = currentStock;
    let quantityIn = 0;
    let quantityOut = 0;
    let movementType = '';

    if (adjustment_type === 'IN') {
      newStock = round2(currentStock + qty);
      quantityIn = qty;
      quantityOut = 0;
      movementType = 'ADJUSTMENT_IN';
    } else {
      if (currentStock < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock for stock-out adjustment',
        });
      }

      newStock = round2(currentStock - qty);
      quantityIn = 0;
      quantityOut = qty;
      movementType = 'ADJUSTMENT_OUT';
    }

    await client.query(
      `UPDATE products
       SET current_stock = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newStock, product_id]
    );

    const movementResult = await client.query(
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
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        product_id,
        movementType,
        'STOCK_ADJUSTMENT',
        0,
        quantityIn,
        quantityOut,
        newStock,
        remarks || reason || `Manual stock adjustment (${adjustment_type})`,
        req.user?.id || null,
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'ADJUST',
      module_name: 'STOCK',
      record_id: Number(product_id),
      description: `Stock adjustment ${adjustment_type} for product ${product.product_code}`,
      metadata: {
        product_id,
        product_code: product.product_code,
        adjustment_type,
        quantity: qty,
        previous_stock: currentStock,
        new_stock: newStock,
        reason,
      },
      client,
    });

    res.status(201).json({
      success: true,
      message: 'Stock adjustment recorded successfully',
      data: {
        product: {
          id: product.id,
          title: product.title,
          product_code: product.product_code,
          previous_stock: currentStock,
          new_stock: newStock,
        },
        adjustment: movementResult.rows[0],
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create stock adjustment error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to record stock adjustment',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const getAdjustmentReasons = async (req, res) => {
  try {
    res.json({
      success: true,
      data: [
        'Opening stock correction',
        'Damaged stock',
        'Lost stock',
        'Physical count difference',
        'Manual correction',
        'Returned stock',
        'Other',
      ],
    });
  } catch (error) {
    console.error('Get adjustment reasons error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch adjustment reasons',
      error: error.message,
    });
  }
};

module.exports = {
  createStockAdjustment,
  getAdjustmentReasons,
};