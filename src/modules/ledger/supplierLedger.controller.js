const pool = require('../../config/db');

const getSupplierLedger = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { from_date, to_date } = req.query;

    // ── Supplier info ──────────────────────────────────────────────────────
    const supplierResult = await pool.query(
      `SELECT id, supplier_code, supplier_name, phone, email, address, opening_balance
       FROM suppliers WHERE id = $1 LIMIT 1`,
      [supplierId]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }

    const supplier = supplierResult.rows[0];

    // ── Period opening balance ─────────────────────────────────────────────
    let periodOpeningBalance = Number(supplier.opening_balance || 0);

    if (from_date) {
      const priorResult = await pool.query(
        `SELECT balance FROM supplier_ledger
         WHERE supplier_id = $1 AND entry_date < $2
         ORDER BY entry_date DESC, id DESC
         LIMIT 1`,
        [supplierId, from_date]
      );
      if (priorResult.rows.length > 0) {
        periodOpeningBalance = Number(priorResult.rows[0].balance);
      }
    }

    // ── Entries (optionally date-filtered) ─────────────────────────────────
    const params = [supplierId];
    let whereClause = 'WHERE supplier_id = $1';

    if (from_date) {
      params.push(from_date);
      whereClause += ` AND entry_date >= $${params.length}`;
    }
    if (to_date) {
      params.push(to_date);
      whereClause += ` AND entry_date <= $${params.length}`;
    }

    const ledgerResult = await pool.query(
      `SELECT id, entry_date, reference_type, reference_id, debit, credit, balance, remarks
       FROM supplier_ledger
       ${whereClause}
       ORDER BY entry_date ASC, id ASC`,
      params
    );

    const entries = ledgerResult.rows;

    // ── Totals from filtered entries ───────────────────────────────────────
    const totalDebit  = entries.reduce((s, e) => s + Number(e.debit  || 0), 0);
    const totalCredit = entries.reduce((s, e) => s + Number(e.credit || 0), 0);
    const closingBalance = entries.length > 0
      ? Number(entries[entries.length - 1].balance)
      : periodOpeningBalance;

    res.json({
      success: true,
      data: {
        supplier,
        period: {
          from_date: from_date || null,
          to_date:   to_date   || null,
        },
        summary: {
          opening_balance: periodOpeningBalance,
          total_debit:     totalDebit,
          total_credit:    totalCredit,
          closing_balance: closingBalance,
        },
        entries,
      },
    });
  } catch (error) {
    console.error('Get supplier ledger error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch supplier ledger' });
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
          COALESCE(
            (SELECT balance FROM supplier_ledger
             WHERE supplier_id = s.id
             ORDER BY entry_date DESC, id DESC
             LIMIT 1),
            s.opening_balance,
            0
          ) AS current_balance
       FROM suppliers s
       ORDER BY s.supplier_name ASC`
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get supplier ledger list error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch supplier ledger list' });
  }
};

module.exports = { getSupplierLedger, getSupplierLedgerList };
