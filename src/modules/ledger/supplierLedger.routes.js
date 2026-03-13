const express = require('express');
const router = express.Router();

const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

const {
  getSupplierLedger,
  getSupplierLedgerList,
} = require('./supplierLedger.controller');

/*
Allowed roles:
admin
manager
inventory
accountant
*/

router.get(
  '/suppliers',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory', 'accountant'),
  getSupplierLedgerList
);

router.get(
  '/suppliers/:supplierId',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory', 'accountant'),
  getSupplierLedger
);

module.exports = router;