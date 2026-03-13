const pool = require('../../config/db');

const generateProductCode = async () => {
  const result = await pool.query(
    'SELECT id FROM products ORDER BY id DESC LIMIT 1'
  );

  const lastId = result.rows.length > 0 ? result.rows[0].id : 0;
  const nextId = lastId + 1;

  return `PROD-${String(nextId).padStart(4, '0')}`;
};

const createProduct = async (req, res) => {
  try {
    const {
      title,
      description,
      unit,
      sale_price,
      purchase_price,
      tax_percent,
      current_stock,
      min_stock_alert,
    } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Product title is required',
      });
    }

    const productCode = await generateProductCode();

    const query = `
      INSERT INTO products (
        product_code,
        title,
        description,
        unit,
        sale_price,
        purchase_price,
        tax_percent,
        current_stock,
        min_stock_alert
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      productCode,
      title.trim(),
      description || null,
      unit || 'pcs',
      sale_price || 0,
      purchase_price || 0,
      tax_percent || 0,
      current_stock || 0,
      min_stock_alert || 0,
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create product error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message,
    });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products ORDER BY id DESC'
    );

    res.json({
      success: true,
      message: 'Products fetched successfully',
      data: result.rows,
    });
  } catch (error) {
    console.error('Get products error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message,
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      unit,
      sale_price,
      purchase_price,
      tax_percent,
      current_stock,
      min_stock_alert,
    } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Product title is required',
      });
    }

    const existing = await pool.query(
      'SELECT * FROM products WHERE id = $1 LIMIT 1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const result = await pool.query(
      `UPDATE products
       SET title = $1,
           description = $2,
           unit = $3,
           sale_price = $4,
           purchase_price = $5,
           tax_percent = $6,
           current_stock = $7,
           min_stock_alert = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [
        title.trim(),
        description || null,
        unit || 'pcs',
        sale_price || 0,
        purchase_price || 0,
        tax_percent || 0,
        current_stock || 0,
        min_stock_alert || 0,
        id,
      ]
    );

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update product error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message,
    });
  }
};

const deactivateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT * FROM products WHERE id = $1 LIMIT 1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const result = await pool.query(
      `UPDATE products
       SET is_active = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    res.json({
      success: true,
      message: 'Product deactivated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Deactivate product error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate product',
      error: error.message,
    });
  }
};

const uploadProductImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Image file is required',
      });
    }

    const existing = await pool.query(
      'SELECT * FROM products WHERE id = $1 LIMIT 1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const imagePath = `/uploads/products/${req.file.filename}`;

    const result = await pool.query(
      `
      UPDATE products
      SET image_url = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
      `,
      [imagePath, id]
    );

    res.json({
      success: true,
      message: 'Product image uploaded successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Upload product image error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to upload product image',
      error: error.message,
    });
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  updateProduct,
  deactivateProduct,
  uploadProductImage,
};