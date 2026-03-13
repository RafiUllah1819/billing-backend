const express = require('express');
const {
  createSupplier,
  getAllSuppliers,
  updateSupplier,
  deleteSupplier,
} = require('./supplier.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

const router = express.Router();

router.get('/', authMiddleware, roleMiddleware('admin', 'manager', 'inventory', 'accountant'), getAllSuppliers);
router.post('/', authMiddleware, roleMiddleware('admin', 'manager', 'inventory'), createSupplier);
router.put('/:id', authMiddleware, roleMiddleware('admin', 'manager', 'inventory'), updateSupplier);
router.delete('/:id', authMiddleware, roleMiddleware('admin', 'manager', 'inventory'), deleteSupplier);

module.exports = router;