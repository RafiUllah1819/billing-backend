const pool = require('../../config/db');

const getCustomerLedger = async (req, res) => {
  try {
    const { customerId } = req.params;

    const customerResult = await pool.query(
      `SELECT id, customer_code, customer_name, phone, email, address, opening_balance
       FROM customers
       WHERE id = $1
       LIMIT 1`,
      [customerId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const customer = customerResult.rows[0];

    const ledgerResult = await pool.query(
      `SELECT
          id,
          entry_date,
          reference_type,
          reference_id,
          debit,
          credit,
          balance,
          remarks,
          created_at
       FROM customer_ledger
       WHERE customer_id = $1
       ORDER BY entry_date ASC, id ASC`,
      [customerId]
    );

    const totalsResult = await pool.query(
      `SELECT
          COALESCE(SUM(debit), 0) AS total_debit,
          COALESCE(SUM(credit), 0) AS total_credit,
          COALESCE(MAX(balance), 0) AS closing_balance
       FROM customer_ledger
       WHERE customer_id = $1`,
      [customerId]
    );

    res.json({
      success: true,
      data: {
        customer,
        summary: {
          opening_balance: Number(customer.opening_balance || 0),
          total_debit: Number(totalsResult.rows[0].total_debit || 0),
          total_credit: Number(totalsResult.rows[0].total_credit || 0),
          closing_balance: Number(totalsResult.rows[0].closing_balance || 0),
        },
        entries: ledgerResult.rows,
      },
    });
  } catch (error) {
    console.error('Get customer ledger error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer ledger',
      error: error.message,
    });
  }
};

const getCustomerLedgerList = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          c.id,
          c.customer_code,
          c.customer_name,
          c.phone,
          c.opening_balance,
          COALESCE(MAX(cl.balance), 0) AS current_balance
       FROM customers c
       LEFT JOIN customer_ledger cl ON cl.customer_id = c.id
       GROUP BY c.id, c.customer_code, c.customer_name, c.phone, c.opening_balance
       ORDER BY c.customer_name ASC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get customer ledger list error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer ledger list',
      error: error.message,
    });
  }
};

module.exports = {
  getCustomerLedger,
  getCustomerLedgerList,
};