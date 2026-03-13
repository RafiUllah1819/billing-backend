const express = require('express');
const {
  createInvoice,
  getAllInvoices,
  getInvoiceById,
  cancelInvoice
} = require('./invoice.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

const router = express.Router();

router.get('/', authMiddleware, roleMiddleware('admin', 'manager', 'sales', 'accountant'), getAllInvoices);
router.get('/:id', authMiddleware, roleMiddleware('admin', 'manager', 'sales', 'accountant'), getInvoiceById);
router.post('/', authMiddleware, roleMiddleware('admin', 'manager', 'sales'), createInvoice);
router.post('/:id/cancel', authMiddleware, roleMiddleware('admin', 'manager', 'sales'), cancelInvoice);

module.exports = router;