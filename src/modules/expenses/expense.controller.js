const pool = require('../../config/db');
const { createAuditLog } = require('../../utils/audit.helper');

const EXPENSE_CATEGORIES = [
  'Salary',
  'Utilities',
  'Transport',
  'Rent',
  'Maintenance',
  'Miscellaneous',
];

const PAYMENT_METHODS = [
  'Cash',
  'Bank Transfer',
  'Cheque',
  'JazzCash',
  'EasyPaisa',
];

const getAllExpenses = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          e.*,
          u.full_name AS created_by_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.created_by
       ORDER BY e.expense_date DESC, e.id DESC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get expenses error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expenses',
    });
  }
};

const createExpense = async (req, res) => {
  try {
    const {
      category,
      description,
      amount,
      expense_date,
      payment_method,
      reference_no = null,
      notes = null,
    } = req.body;

    if (!category || !EXPENSE_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Category is required. Allowed: ${EXPENSE_CATEGORIES.join(', ')}`,
      });
    }

    if (!description || String(description).trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Description is required',
      });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than zero',
      });
    }

    if (payment_method && !PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment method. Allowed: ${PAYMENT_METHODS.join(', ')}`,
      });
    }

    const result = await pool.query(
      `INSERT INTO expenses (
          category,
          description,
          amount,
          expense_date,
          payment_method,
          reference_no,
          notes,
          created_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        category,
        String(description).trim(),
        Number(amount),
        expense_date || new Date(),
        payment_method || null,
        reference_no || null,
        notes || null,
        req.user?.id || null,
      ]
    );

    const expense = result.rows[0];

    await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'CREATE',
      module_name: 'EXPENSE',
      record_id: expense.id,
      description: `Created expense: ${expense.description} (${expense.category}) - ${expense.amount}`,
      metadata: { category, amount: expense.amount },
    });

    res.status(201).json({
      success: true,
      message: 'Expense created successfully',
      data: expense,
    });
  } catch (error) {
    console.error('Create expense error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create expense',
    });
  }
};

const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      category,
      description,
      amount,
      expense_date,
      payment_method,
      reference_no = null,
      notes = null,
    } = req.body;

    const existing = await pool.query(
      'SELECT id FROM expenses WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found',
      });
    }

    if (!category || !EXPENSE_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Category is required. Allowed: ${EXPENSE_CATEGORIES.join(', ')}`,
      });
    }

    if (!description || String(description).trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Description is required',
      });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than zero',
      });
    }

    if (payment_method && !PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment method. Allowed: ${PAYMENT_METHODS.join(', ')}`,
      });
    }

    const result = await pool.query(
      `UPDATE expenses
       SET category       = $1,
           description    = $2,
           amount         = $3,
           expense_date   = $4,
           payment_method = $5,
           reference_no   = $6,
           notes          = $7,
           updated_at     = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [
        category,
        String(description).trim(),
        Number(amount),
        expense_date,
        payment_method || null,
        reference_no || null,
        notes || null,
        id,
      ]
    );

    const expense = result.rows[0];

    await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'UPDATE',
      module_name: 'EXPENSE',
      record_id: expense.id,
      description: `Updated expense: ${expense.description} (${expense.category}) - ${expense.amount}`,
      metadata: { category, amount: expense.amount },
    });

    res.json({
      success: true,
      message: 'Expense updated successfully',
      data: expense,
    });
  } catch (error) {
    console.error('Update expense error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update expense',
    });
  }
};

const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT id, description, category FROM expenses WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found',
      });
    }

    const expense = existing.rows[0];

    await pool.query('DELETE FROM expenses WHERE id = $1', [id]);

    await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'DELETE',
      module_name: 'EXPENSE',
      record_id: Number(id),
      description: `Deleted expense: ${expense.description} (${expense.category})`,
      metadata: {},
    });

    res.json({
      success: true,
      message: 'Expense deleted successfully',
    });
  } catch (error) {
    console.error('Delete expense error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete expense',
    });
  }
};

module.exports = {
  getAllExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
};
