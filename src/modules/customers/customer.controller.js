const pool = require('../../config/db');

const generateCustomerCode = async () => {
  const result = await pool.query(
    'SELECT id FROM customers ORDER BY id DESC LIMIT 1'
  );

  const lastId = result.rows.length > 0 ? result.rows[0].id : 0;
  const nextId = lastId + 1;

  return `CUST-${String(nextId).padStart(4, '0')}`;
};

const createCustomer = async (req, res) => {
  try {
    const { customer_name, phone, email, address, opening_balance } = req.body;

    if (!customer_name || customer_name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Customer name is required',
      });
    }

    const customerCode = await generateCustomerCode();

    const query = `
      INSERT INTO customers (
        customer_code,
        customer_name,
        phone,
        email,
        address,
        opening_balance
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      customerCode,
      customer_name.trim(),
      phone || null,
      email || null,
      address || null,
      opening_balance || 0,
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Create customer error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create customer',
      error: error.message,
    });
  }
};

const getAllCustomers = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM customers ORDER BY id DESC'
    );

    res.json({
      success: true,
      message: 'Customers fetched successfully',
      data: result.rows,
    });
  } catch (error) {
    console.error('Get customers error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers',
      error: error.message,
    });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_name, phone, email, address, opening_balance } = req.body;

    if (!customer_name || customer_name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Customer name is required',
      });
    }

    const existing = await pool.query(
      'SELECT * FROM customers WHERE id = $1 LIMIT 1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const result = await pool.query(
      `UPDATE customers
       SET customer_name = $1,
           phone = $2,
           email = $3,
           address = $4,
           opening_balance = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        customer_name.trim(),
        phone || null,
        email || null,
        address || null,
        opening_balance || 0,
        id,
      ]
    );

    res.json({
      success: true,
      message: 'Customer updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Update customer error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update customer',
      error: error.message,
    });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT * FROM customers WHERE id = $1 LIMIT 1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const invoiceCheck = await pool.query(
      'SELECT 1 FROM sales_invoices WHERE customer_id = $1 LIMIT 1',
      [id]
    );

    if (invoiceCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Customer cannot be deleted because it is used in invoices',
      });
    }

    const ledgerCheck = await pool.query(
      'SELECT 1 FROM customer_ledger WHERE customer_id = $1 LIMIT 1',
      [id]
    );

    if (ledgerCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Customer cannot be deleted because it is used in ledger records',
      });
    }

    await pool.query('DELETE FROM customers WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Customer deleted successfully',
    });
  } catch (error) {
    console.error('Delete customer error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete customer',
      error: error.message,
    });
  }
};

module.exports = {
  createCustomer,
  getAllCustomers,
  updateCustomer,
  deleteCustomer,
};