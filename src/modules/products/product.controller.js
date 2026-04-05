const pool = require('../../config/db');

const generateProductCode = async () => {
  const result = await pool.query(
    'SELECT id FROM products ORDER BY id DESC LIMIT 1'
  );
  const lastId = result.rows.length > 0 ? result.rows[0].id : 0;
  return `PROD-${String(lastId + 1).padStart(4, '0')}`;
};

const createProduct = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      title,
      description,
      category,
      sku,
      unit,
      sale_price,
      purchase_price,
      tax_percent,
      current_stock,
      min_stock_alert,
      opening_stock,
      opening_stock_rate,
    } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, message: 'Product title is required' });
    }

    const openingQty  = Number(opening_stock  || 0);
    const openingRate = Number(opening_stock_rate || 0);
    // current_stock initialises to opening_stock (manual override still respected)
    const initStock = current_stock !== undefined && current_stock !== ''
      ? Number(current_stock)
      : openingQty;

    const productCode = await generateProductCode();

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO products (
          product_code, title, description, category, sku,
          unit, sale_price, purchase_price, tax_percent,
          current_stock, min_stock_alert,
          opening_stock, opening_stock_rate
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *`,
      [
        productCode,
        title.trim(),
        description   || null,
        category      || null,
        sku           || null,
        unit          || 'pcs',
        sale_price    || 0,
        purchase_price|| 0,
        tax_percent   || 0,
        initStock,
        min_stock_alert || 0,
        openingQty,
        openingRate,
      ]
    );

    const product = result.rows[0];

    // Record opening stock movement so the history starts correctly
    if (openingQty > 0) {
      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, reference_type, reference_id,
            quantity_in, quantity_out, balance_after, remarks, created_by)
         VALUES ($1,'IN','OPENING_STOCK',$2,$3,0,$4,'Opening stock',$5)`,
        [product.id, product.id, openingQty, openingQty, req.user?.id || null]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create product error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create product', error: error.message });
  } finally {
    client.release();
  }
};

const getAllProducts = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.json({ success: true, message: 'Products fetched successfully', data: result.rows });
  } catch (error) {
    console.error('Get products error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch products', error: error.message });
  }
};

const getProductCategories = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category FROM products
       WHERE category IS NOT NULL AND category <> '' AND is_active = TRUE
       ORDER BY category ASC`
    );
    res.json({ success: true, data: result.rows.map((r) => r.category) });
  } catch (error) {
    console.error('Get categories error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      sku,
      unit,
      sale_price,
      purchase_price,
      tax_percent,
      current_stock,
      min_stock_alert,
      opening_stock_rate,
    } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, message: 'Product title is required' });
    }

    const existing = await pool.query('SELECT * FROM products WHERE id = $1 LIMIT 1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const result = await pool.query(
      `UPDATE products
       SET title              = $1,
           description        = $2,
           category           = $3,
           sku                = $4,
           unit               = $5,
           sale_price         = $6,
           purchase_price     = $7,
           tax_percent        = $8,
           current_stock      = $9,
           min_stock_alert    = $10,
           opening_stock_rate = $11,
           updated_at         = CURRENT_TIMESTAMP
       WHERE id = $12
       RETURNING *`,
      [
        title.trim(),
        description        || null,
        category           || null,
        sku                || null,
        unit               || 'pcs',
        sale_price         || 0,
        purchase_price     || 0,
        tax_percent        || 0,
        current_stock      || 0,
        min_stock_alert    || 0,
        opening_stock_rate || 0,
        id,
      ]
    );

    res.json({ success: true, message: 'Product updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Update product error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update product', error: error.message });
  }
};

const deactivateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM products WHERE id = $1 LIMIT 1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const result = await pool.query(
      `UPDATE products SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id]
    );
    res.json({ success: true, message: 'Product deactivated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Deactivate product error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to deactivate product', error: error.message });
  }
};

const uploadProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image file is required' });
    }
    const existing = await pool.query('SELECT * FROM products WHERE id = $1 LIMIT 1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const imagePath = `/uploads/products/${req.file.filename}`;
    const result = await pool.query(
      `UPDATE products SET image_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [imagePath, id]
    );
    res.json({ success: true, message: 'Product image uploaded successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Upload product image error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to upload product image', error: error.message });
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductCategories,
  updateProduct,
  deactivateProduct,
  uploadProductImage,
};
