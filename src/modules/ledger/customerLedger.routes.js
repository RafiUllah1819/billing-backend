const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');


const {
  getCustomerLedger,
  getCustomerLedgerList,
} = require('./customerLedger.controller');

router.get('/customers', authMiddleware, roleMiddleware('admin', 'manager', 'sales', 'accountant'), getCustomerLedgerList);
router.get('/customers/:customerId', authMiddleware, roleMiddleware('admin', 'manager', 'sales', 'accountant'), getCustomerLedger);

module.exports = router;