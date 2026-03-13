const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');
const {
  receiveSalesReturn,
  issuePurchaseReturn,
} = require('./return.controller');

router.post('/sales', authMiddleware, roleMiddleware('admin', 'manager', 'sales'), receiveSalesReturn);
router.post('/purchases', authMiddleware, roleMiddleware('admin', 'manager', 'inventory'), issuePurchaseReturn);

module.exports = router;