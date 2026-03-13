const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');
const {
  receiveCustomerPayment,
  paySupplierPayment,
  getAllPayments,
  getCustomerUnpaidInvoices,
  getSupplierUnpaidBills
} = require('./payment.controller');

router.get(
  '/',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'sales', 'inventory', 'accountant'),
  getAllPayments
);

router.get(
  '/customer-invoices/:customerId',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'sales', 'accountant'),
  getCustomerUnpaidInvoices
);

router.post(
  '/customer-receipt',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'sales', 'accountant'),
  receiveCustomerPayment
);

router.post(
  '/supplier-payment',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory', 'accountant'),
  paySupplierPayment
);

router.get(
  '/supplier-bills/:supplierId',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory', 'accountant'),
  getSupplierUnpaidBills
);

module.exports = router;