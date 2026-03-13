const pool = require('../../config/db');

exports.getStockReport = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        product_code,
        title,
        unit,
        sale_price,
        purchase_price,
        current_stock,
        min_stock_alert,
        (current_stock * purchase_price) AS stock_value
      FROM products
      WHERE is_active = true
      ORDER BY title ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Failed to load stock report'
    });
  }
};