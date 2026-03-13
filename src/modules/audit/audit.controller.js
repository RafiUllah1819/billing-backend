const pool = require('../../config/db');

const getAuditLogs = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        al.id,
        al.user_id,
        al.action_type,
        al.module_name,
        al.record_id,
        al.description,
        al.metadata,
        al.created_at,
        u.username,
        u.full_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.id DESC
      LIMIT 500
    `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get audit logs error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
      error: error.message,
    });
  }
};

module.exports = {
  getAuditLogs,
};