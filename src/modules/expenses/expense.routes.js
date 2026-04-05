const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');
const {
  getAllExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} = require('./expense.controller');

// All authenticated users can view expenses
router.get(
  '/',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'sales', 'inventory', 'accountant'),
  getAllExpenses
);

// Only admin, manager, accountant can create/edit/delete
router.post(
  '/',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'accountant'),
  createExpense
);

router.put(
  '/:id',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'accountant'),
  updateExpense
);

router.delete(
  '/:id',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'accountant'),
  deleteExpense
);

module.exports = router;
