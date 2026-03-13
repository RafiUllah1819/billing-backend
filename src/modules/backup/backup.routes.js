const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');
const {
  createDatabaseBackup,
  getBackupFiles,
  downloadBackupFile,
} = require('./backup.controller');

router.get(
  '/',
  authMiddleware,
  roleMiddleware('admin'),
  getBackupFiles
);

router.post(
  '/create',
  authMiddleware,
  roleMiddleware('admin'),
  createDatabaseBackup
);

router.get(
  '/download/:filename',
  authMiddleware,
  roleMiddleware('admin'),
  downloadBackupFile
);

module.exports = router;