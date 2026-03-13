const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');
const {
  getCustomerAgingReport,
  getSupplierAgingReport,
} = require('./aging.controller');

router.get(
  '/customers',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'sales', 'accountant'),
  getCustomerAgingReport
);

router.get(
  '/suppliers',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory', 'accountant'),
  getSupplierAgingReport
);

module.exports = router;