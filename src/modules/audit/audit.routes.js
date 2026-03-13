const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');
const { getAuditLogs } = require('./audit.controller');

router.get(
  '/',
  authMiddleware,
  roleMiddleware('admin'),
  getAuditLogs
);

module.exports = router;