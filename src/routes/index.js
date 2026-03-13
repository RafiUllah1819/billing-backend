const express = require('express');
const pool = require('../config/db');
const authRoutes = require('../modules/auth/auth.routes');
const customerRoutes = require('../modules/customers/customer.routes');
const supplierRoutes = require('../modules/suppliers/supplier.routes');
const productRoutes = require('../modules/products/product.routes');
const invoiceRoutes = require('../modules/invoices/invoice.routes');
const purchaseRoutes = require('../modules/purchases/purchase.routes');
const dashboardRoutes = require('../modules/dashboard/dashboard.routes');
const reportRoutes = require('../modules/reports/report.routes');
const customerLedgerRoutes = require('../modules/ledger/customerLedger.routes');
const supplierLedgerRoutes = require('../modules/ledger/supplierLedger.routes');
const paymentRoutes = require('../modules/payments/payment.routes');
const stockRoutes = require('../modules/stock/stock.routes');
const adjustmentRoutes = require('../modules/adjustments/adjustment.routes');
const returnRoutes = require('../modules/returns/return.routes');
const userRoutes = require('../modules/users/user.routes');
const auditRoutes = require('../modules/audit/audit.routes');
const settingsRoutes = require('../modules/settings/settings.routes');
const agingRoutes = require('../modules/aging/aging.routes');
const backupRoutes = require('../modules/backup/backup.routes');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
  });
});

router.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');

    res.json({
      success: true,
      message: 'Database connected successfully',
      serverTime: result.rows[0].now,
    });
  } catch (error) {
    console.error('Health check error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message,
    });
  }
});

router.use('/auth', authRoutes);
router.use('/customers', customerRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/products', productRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/ledger', customerLedgerRoutes);
router.use('/ledger', supplierLedgerRoutes);
router.use('/payments', paymentRoutes);
router.use('/stock', stockRoutes);
router.use('/adjustments', adjustmentRoutes);
router.use('/returns', returnRoutes);
router.use('/users', userRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/settings', settingsRoutes);
router.use('/aging', agingRoutes);
router.use('/backups', backupRoutes);

module.exports = router;