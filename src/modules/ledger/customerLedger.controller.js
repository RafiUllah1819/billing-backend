const pool = require('../../config/db');

const getCustomerLedger = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { from_date, to_date } = req.query;

    // ── Customer info ──────────────────────────────────────────────────────
    const customerResult = await pool.query(
      `SELECT id, customer_code, customer_name, phone, email, address, opening_balance
       FROM customers WHERE id = $1 LIMIT 1`,
      [customerId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const customer = customerResult.rows[0];

    // ── Period opening balance ─────────────────────────────────────────────
    // If from_date is given, the period opening balance = balance of the last
    // entry BEFORE from_date.  If no such entry exists, fall back to the
    // customer's stored opening_balance.
    let periodOpeningBalance = Number(customer.opening_balance || 0);

    if (from_date) {
      const priorResult = await pool.query(
        `SELECT balance FROM customer_ledger
         WHERE customer_id = $1 AND entry_date < $2
         ORDER BY entry_date DESC, id DESC
         LIMIT 1`,
        [customerId, from_date]
      );
      if (priorResult.rows.length > 0) {
        periodOpeningBalance = Number(priorResult.rows[0].balance);
      }
    }

    // ── Entries (optionally date-filtered) ─────────────────────────────────
    const params = [customerId];
    let whereClause = 'WHERE customer_id = $1';

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
       FROM customer_ledger
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
        customer,
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
    console.error('Get customer ledger error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch customer ledger' });
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
          COALESCE(
            (SELECT balance FROM customer_ledger
             WHERE customer_id = c.id
             ORDER BY entry_date DESC, id DESC
             LIMIT 1),
            c.opening_balance,
            0
          ) AS current_balance
       FROM customers c
       ORDER BY c.customer_name ASC`
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get customer ledger list error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch customer ledger list' });
  }
};

module.exports = { getCustomerLedger, getCustomerLedgerList };
