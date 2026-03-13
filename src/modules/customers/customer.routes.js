const express = require('express');
const {
  createCustomer,
  getAllCustomers,
  updateCustomer,
  deleteCustomer,
} = require('./customer.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

const router = express.Router();

router.get('/', authMiddleware, roleMiddleware('admin', 'manager', 'sales', 'accountant'), getAllCustomers);
router.post('/', authMiddleware, roleMiddleware('admin', 'manager', 'sales'), createCustomer);
router.put('/:id', authMiddleware, roleMiddleware('admin', 'manager', 'sales'), updateCustomer);
router.delete('/:id', authMiddleware, roleMiddleware('admin', 'manager', 'sales'), deleteCustomer);

module.exports = router;