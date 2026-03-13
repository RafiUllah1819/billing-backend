const express = require('express');

const {
  getAllUsers,
  createUser,
  updateUser,
  resetPassword
} = require('./user.controller');

const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

const router = express.Router();

/*
Only admin can manage users
*/

router.get(
  '/',
  authMiddleware,
  roleMiddleware('admin'),
  getAllUsers
);

router.post(
  '/',
  authMiddleware,
  roleMiddleware('admin'),
  createUser
);

router.put(
  '/:id',
  authMiddleware,
  roleMiddleware('admin'),
  updateUser
);

router.post(
  '/:id/reset-password',
  authMiddleware,
  roleMiddleware('admin'),
  resetPassword
);

module.exports = router;