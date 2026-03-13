const pool = require('../../config/db');

const getSupplierLedger = async (req, res) => {
  try {
    const { supplierId } = req.params;

    const supplierResult = await pool.query(
      `SELECT id, supplier_code, supplier_name, phone, email, address, opening_balance
       FROM suppliers
       WHERE id = $1
       LIMIT 1`,
      [supplierId]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found',
      });
    }

    const supplier = supplierResult.rows[0];

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
       FROM supplier_ledger
       WHERE supplier_id = $1
       ORDER BY entry_date ASC, id ASC`,
      [supplierId]
    );

    const totalsResult = await pool.query(
      `SELECT
          COALESCE(SUM(debit), 0) AS total_debit,
          COALESCE(SUM(credit), 0) AS total_credit,
          COALESCE(MAX(balance), 0) AS closing_balance
       FROM supplier_ledger
       WHERE supplier_id = $1`,
      [supplierId]
    );

    res.json({
      success: true,
      data: {
        supplier,
        summary: {
          opening_balance: Number(supplier.opening_balance || 0),
          total_debit: Number(totalsResult.rows[0].total_debit || 0),
          total_credit: Number(totalsResult.rows[0].total_credit || 0),
          closing_balance: Number(totalsResult.rows[0].closing_balance || 0),
        },
        entries: ledgerResult.rows,
      },
    });
  } catch (error) {
    console.error('Get supplier ledger error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch supplier ledger',
      error: error.message,
    });
  }
};

const getSupplierLedgerList = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          s.id,
          s.supplier_code,
          s.supplier_name,
          s.phone,
          s.opening_balance,
          COALESCE(MAX(sl.balance), 0) AS current_balance
       FROM suppliers s
       LEFT JOIN supplier_ledger sl ON sl.supplier_id = s.id
       GROUP BY s.id, s.supplier_code, s.supplier_name, s.phone, s.opening_balance
       ORDER BY s.supplier_name ASC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get supplier ledger list error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch supplier ledger list',
      error: error.message,
    });
  }
};

module.exports = {
  getSupplierLedger,
  getSupplierLedgerList,
};