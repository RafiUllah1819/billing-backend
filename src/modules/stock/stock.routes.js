const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

const {
  getAllStockMovements,
  getProductStockMovements,
} = require('./stock.controller');

router.get('/movements', authMiddleware, roleMiddleware('admin', 'manager', 'inventory', 'accountant'), getAllStockMovements);
router.get('/movements/:productId', authMiddleware, roleMiddleware('admin', 'manager', 'inventory', 'accountant'), getProductStockMovements);

module.exports = router;