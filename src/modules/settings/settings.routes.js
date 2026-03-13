const express = require('express');

const {
  getSettings,
  updateSettings, 
  uploadCompanyLogo
} = require('./settings.controller');

const { logoUpload } = require('../../utils/upload.helper');
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

const router = express.Router();

router.get(
  '/',
  authMiddleware,
  roleMiddleware('admin', 'manager'),
  getSettings
);

router.put(
  '/',
  authMiddleware,
  roleMiddleware('admin'),
  updateSettings
);

router.post(
  '/logo',
  authMiddleware,
  roleMiddleware('admin'),
  logoUpload.single('logo'),
  uploadCompanyLogo
);

module.exports = router;