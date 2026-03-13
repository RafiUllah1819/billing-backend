const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');
const {
  createStockAdjustment,
  getAdjustmentReasons,
} = require('./adjustment.controller');

router.get('/reasons', authMiddleware, roleMiddleware('admin', 'manager', 'inventory'), getAdjustmentReasons);
router.post('/', authMiddleware, roleMiddleware('admin', 'manager', 'inventory'), createStockAdjustment);

module.exports = router;