/**
 * Role → Permission mapping.
 * Keep this as the single source of truth for access control.
 *
 * Roles:
 *   admin         – full access
 *   manager       – operational access (no user/settings/backup management)
 *   accountant    – financial read/write, no stock ops
 *   sales         – invoices and payments only  (legacy name)
 *   cashier       – same as sales (new preferred name)
 *   inventory     – stock and purchases only    (legacy name)
 *   inventory_user– same as inventory (new preferred name)
 */

const ROLE_PERMISSIONS = {
  admin: [
    'manage_users',
    'create_invoice',
    'edit_invoice',
    'delete_invoice',
    'receive_payment',
    'manage_purchases',
    'adjust_stock',
    'view_reports',
    'manage_settings',
    'view_audit_logs',
    'manage_backups',
    'manage_expenses',
  ],
  manager: [
    'create_invoice',
    'edit_invoice',
    'receive_payment',
    'manage_purchases',
    'adjust_stock',
    'view_reports',
    'manage_expenses',
  ],
  accountant: [
    'create_invoice',
    'receive_payment',
    'view_reports',
    'manage_expenses',
  ],
  sales: [
    'create_invoice',
    'receive_payment',
  ],
  cashier: [
    'create_invoice',
    'receive_payment',
  ],
  inventory: [
    'manage_purchases',
    'adjust_stock',
  ],
  inventory_user: [
    'manage_purchases',
    'adjust_stock',
  ],
};

/**
 * Returns true if the given role has the given permission.
 */
const hasPermission = (role, permission) => {
  const perms = ROLE_PERMISSIONS[String(role).toLowerCase()] || [];
  return perms.includes(permission);
};

module.exports = { ROLE_PERMISSIONS, hasPermission };
