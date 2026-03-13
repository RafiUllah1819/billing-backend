const pool = require('../../config/db');

const getAllStockMovements = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        sm.id,
        sm.product_id,
        sm.movement_type,
        sm.reference_type,
        sm.reference_id,
        sm.quantity_in,
        sm.quantity_out,
        sm.balance_after,
        sm.remarks,
        sm.created_at,
        p.product_code,
        p.title
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      ORDER BY sm.id DESC
    `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get stock movements error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stock movements',
      error: error.message,
    });
  }
};

const getProductStockMovements = async (req, res) => {
  try {
    const { productId } = req.params;

    const productResult = await pool.query(
      `SELECT
          id,
          product_code,
          title,
          unit,
          current_stock,
          min_stock_alert,
          is_active
       FROM products
       WHERE id = $1
       LIMIT 1`,
      [productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const movementResult = await pool.query(
      `SELECT
          id,
          movement_type,
          reference_type,
          reference_id,
          quantity_in,
          quantity_out,
          balance_after,
          remarks,
          created_at
       FROM stock_movements
       WHERE product_id = $1
       ORDER BY id DESC`,
      [productId]
    );

    res.json({
      success: true,
      data: {
        product: productResult.rows[0],
        movements: movementResult.rows,
      },
    });
  } catch (error) {
    console.error('Get product stock movements error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product stock movements',
      error: error.message,
    });
  }
};

module.exports = {
  getAllStockMovements,
  getProductStockMovements,
};