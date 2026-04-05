const pool = require('../../config/db');
const bcrypt = require('bcryptjs');
const { createAuditLog } = require('../../utils/audit.helper');

const VALID_ROLES = ['admin', 'manager', 'accountant', 'sales', 'cashier', 'inventory', 'inventory_user'];

const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, email, full_name, role, is_active, created_at
      FROM users
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get users error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
    });
  }
};

const createUser = async (req, res) => {
  try {
    const {
      username,
      email,
      full_name,
      password,
      role
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed: ${VALID_ROLES.join(', ')}`
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users
      (username, email, full_name, password_hash, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, email, full_name, role, is_active
      `,
      [username, email, full_name, passwordHash, role || 'sales']
    );

    const createdUser = result.rows[0];

    await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'CREATE',
      module_name: 'USERS',
      record_id: createdUser.id,
      description: `Created user ${createdUser.username}`,
      metadata: {
        username: createdUser.username,
        email: createdUser.email,
        full_name: createdUser.full_name,
        role: createdUser.role,
        is_active: createdUser.is_active,
      },
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: createdUser
    });
  } catch (error) {
    console.error('Create user error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      email,
      full_name,
      role,
      is_active
    } = req.body;

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed: ${VALID_ROLES.join(', ')}`
      });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET
        email = $1,
        full_name = $2,
        role = $3,
        is_active = $4,
        updated_at = NOW()
      WHERE id = $5
      RETURNING id, username, email, full_name, role, is_active
      `,
      [email, full_name, role, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const updatedUser = result.rows[0];

    await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'UPDATE',
      module_name: 'USERS',
      record_id: Number(id),
      description: `Updated user ${updatedUser.username}`,
      metadata: {
        email: updatedUser.email,
        full_name: updatedUser.full_name,
        role: updatedUser.role,
        is_active: updatedUser.is_active,
      },
    });

    res.json({
      success: true,
      message: 'User updated',
      data: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;

    if (!new_password) {
      return res.status(400).json({
        success: false,
        message: 'New password required'
      });
    }

    const userResult = await pool.query(
      `
      SELECT id, username
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const hash = await bcrypt.hash(new_password, 10);

    await pool.query(
      `
      UPDATE users
      SET password_hash = $1,
          updated_at = NOW()
      WHERE id = $2
      `,
      [hash, id]
    );

    await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'RESET_PASSWORD',
      module_name: 'USERS',
      record_id: Number(id),
      description: `Reset password for user ${userResult.rows[0].username}`,
      metadata: {
        target_user_id: Number(id),
        username: userResult.rows[0].username,
      },
    });

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
};

module.exports = {
  getAllUsers,
  createUser,
  updateUser,
  resetPassword
};