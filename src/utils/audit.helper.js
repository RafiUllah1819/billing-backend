const pool = require('../config/db');

const createAuditLog = async ({
  user_id = null,
  action_type,
  module_name,
  record_id = null,
  description = '',
  metadata = {},
  client = null,
}) => {
  const query = `
    INSERT INTO audit_logs (
      user_id,
      action_type,
      module_name,
      record_id,
      description,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6)
  `;

  const values = [
    user_id,
    action_type,
    module_name,
    record_id,
    description,
    JSON.stringify(metadata || {}),
  ];

  if (client) {
    await client.query(query, values);
  } else {
    await pool.query(query, values);
  }
};

module.exports = {
  createAuditLog,
};