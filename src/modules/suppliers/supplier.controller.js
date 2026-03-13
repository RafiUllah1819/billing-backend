const pool = require('../../config/db');

const generateSupplierCode = async () => {
  const result = await pool.query(
    'SELECT id FROM suppliers ORDER BY id DESC LIMIT 1'
  );

  const lastId = result.rows.length > 0 ? result.rows[0].id : 0;
  const nextId = lastId + 1;

  return `SUP-${String(nextId).padStart(4, '0')}`;
};

const createSupplier = async (req, res) => {
  try {
    const { supplier_name, phone, email, address, opening_balance } = req.body;

    if (!supplier_name || supplier_name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Supplier name is required',
      });
    }

    const supplierCode = await generateSupplierCode();

    const query = `
      INSERT INTO suppliers (
        supplier_code,
        supplier_name,
        phone,
        email,
        address,
        opening_balance
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      supplierCode,
      supplier_name.trim(),
      phone || null,
      email || null,
      address || null,
      opening_balance || 0,
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create supplier error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create supplier',
      error: error.message,
    });
  }
};

const getAllSuppliers = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM suppliers ORDER BY id DESC'
    );

    res.json({
      success: true,
      message: 'Suppliers fetched successfully',
      data: result.rows,
    });
  } catch (error) {
    console.error('Get suppliers error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch suppliers',
      error: error.message,
    });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const { supplier_name, phone, email, address, opening_balance } = req.body;

    if (!supplier_name || supplier_name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Supplier name is required',
      });
    }

    const existing = await pool.query(
      'SELECT * FROM suppliers WHERE id = $1 LIMIT 1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found',
      });
    }

    const result = await pool.query(
      `UPDATE suppliers
       SET supplier_name = $1,
           phone = $2,
           email = $3,
           address = $4,
           opening_balance = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        supplier_name.trim(),
        phone || null,
        email || null,
        address || null,
        opening_balance || 0,
        id,
      ]
    );

    res.json({
      success: true,
      message: 'Supplier updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update supplier error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update supplier',
      error: error.message,
    });
  }
};

const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT * FROM suppliers WHERE id = $1 LIMIT 1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found',
      });
    }

    const billCheck = await pool.query(
      'SELECT 1 FROM purchase_bills WHERE supplier_id = $1 LIMIT 1',
      [id]
    );

    if (billCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Supplier cannot be deleted because it is used in purchase bills',
      });
    }

    const ledgerCheck = await pool.query(
      'SELECT 1 FROM supplier_ledger WHERE supplier_id = $1 LIMIT 1',
      [id]
    );

    if (ledgerCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Supplier cannot be deleted because it is used in ledger records',
      });
    }

    await pool.query('DELETE FROM suppliers WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Supplier deleted successfully',
    });
  } catch (error) {
    console.error('Delete supplier error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete supplier',
      error: error.message,
    });
  }
};

module.exports = {
  createSupplier,
  getAllSuppliers,
  updateSupplier,
  deleteSupplier,
};