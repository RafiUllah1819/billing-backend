const { hasPermission } = require('../config/permissions');

/**
 * Express middleware that checks if the authenticated user has a specific permission.
 * Must be used AFTER authMiddleware (which sets req.user).
 *
 * Usage:
 *   router.post('/invoices', authMiddleware, permissionMiddleware('create_invoice'), handler)
 */
const permissionMiddleware = (permission) => (req, res, next) => {
  const role = req.user?.role;

  if (!role) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (!hasPermission(role, permission)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required permission: ${permission}`,
    });
  }

  next();
};

module.exports = permissionMiddleware;
