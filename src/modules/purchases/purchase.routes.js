const express = require('express');
const {
  createPurchaseBill,
  getAllPurchaseBills,
  getPurchaseBillById,
  cancelPurchaseBill
} = require('./purchase.controller');

const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

const router = express.Router();

/*
Roles allowed:
admin
manager
inventory
accountant
*/

router.get(
  '/',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory', 'accountant'),
  getAllPurchaseBills
);

router.get(
  '/:id',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory', 'accountant'),
  getPurchaseBillById
);

router.post(
  '/',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory'),
  createPurchaseBill
);

router.post(
  '/:id/cancel',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory'),
  cancelPurchaseBill
);

module.exports = router;