const express = require('express');
const {
  createProduct,
  getAllProducts,
  updateProduct,
  deactivateProduct,
  uploadProductImage,
} = require('./product.controller');

const { productImageUpload } = require('../../utils/upload.helper');

const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

const router = express.Router();

router.get(
  '/',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory', 'sales', 'accountant'),
  getAllProducts
);

router.post(
  '/',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory'),
  createProduct
);

router.put(
  '/:id',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory'),
  updateProduct
);

router.delete(
  '/:id',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory'),
  deactivateProduct
);

router.post(
  '/:id/image',
  authMiddleware,
  roleMiddleware('admin', 'manager', 'inventory'),
  productImageUpload.single('image'),
  uploadProductImage
);

module.exports = router;