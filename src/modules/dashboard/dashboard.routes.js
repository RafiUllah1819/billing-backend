const express = require('express');
const {
  getDashboardSummary,
  getDashboardAnalytics,
  getLowStockProducts,
  getRecentSales,
  getRecentPurchases,
  getLowStockAlerts,
  getMonthlySalesChart,
  getMonthlyPurchasesChart,
  getTopSellingProducts,
  getDashboardOverview,
} = require('./dashboard.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

const router = express.Router();

router.get('/summary', authMiddleware, roleMiddleware('admin', 'manager', 'sales', 'inventory', 'accountant'), getDashboardSummary);
router.get('/analytics', authMiddleware, roleMiddleware('admin', 'manager', 'sales', 'inventory', 'accountant'), getDashboardAnalytics);
router.get('/low-stock', authMiddleware, roleMiddleware('admin', 'manager', 'inventory', 'accountant'), getLowStockProducts);
router.get('/recent-sales', authMiddleware, roleMiddleware('admin', 'manager', 'sales', 'accountant'), getRecentSales);
router.get('/recent-purchases', authMiddleware, roleMiddleware('admin', 'manager', 'inventory', 'accountant'), getRecentPurchases);

router.get(
  '/low-stock-alerts',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory', 'accountant'),
  getLowStockAlerts
);

router.get(
  '/monthly-sales-chart',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'sales', 'accountant'),
  getMonthlySalesChart
);

router.get(
  '/monthly-purchases-chart',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory', 'accountant'),
  getMonthlyPurchasesChart
);

router.get(
  '/top-selling-products',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'sales', 'accountant'),
  getTopSellingProducts
);


router.get(
  '/overview',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'sales', 'inventory', 'accountant', 'cashier', 'inventory_user'),
  getDashboardOverview
);

module.exports = router;