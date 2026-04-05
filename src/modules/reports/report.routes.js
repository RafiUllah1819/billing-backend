const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');
const reportController = require('./report.controller');

router.get('/stock', reportController.getStockReport);

router.get(
  '/profit-loss',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'accountant'),
  reportController.getProfitLoss
);

module.exports = router;