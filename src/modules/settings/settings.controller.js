const pool = require('../../config/db');
const { createAuditLog } = require('../../utils/audit.helper');

const getSettings = async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT *
      FROM settings
      ORDER BY id ASC
      LIMIT 1
    `);

    res.json({
      success: true,
      data: result.rows[0] || null
    });

  } catch (error) {

    console.error('Get settings error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });

  }

};


const updateSettings = async (req, res) => {

  try {

    const {
      company_name,
      company_address,
      company_phone,
      company_email,
      company_website,
      invoice_prefix,
      purchase_prefix,
      currency_symbol
    } = req.body;

    const result = await pool.query(
      `
      UPDATE settings
      SET
      company_name=$1,
      company_address=$2,
      company_phone=$3,
      company_email=$4,
      company_website=$5,
      invoice_prefix=$6,
      purchase_prefix=$7,
      currency_symbol=$8,
      updated_at=NOW()
      WHERE id=1
      RETURNING *
      `,
      [
        company_name,
        company_address,
        company_phone,
        company_email,
        company_website,
        invoice_prefix,
        purchase_prefix,
        currency_symbol
      ]
    );

    await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'UPDATE',
      module_name: 'SETTINGS',
      record_id: 1,
      description: 'Updated system settings',
      metadata: {
        company_name,
        company_phone,
        company_email
      }
    });

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: result.rows[0]
    });

  } catch (error) {

    console.error('Update settings error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });

  }

};

const uploadCompanyLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Logo file is required',
      });
    }

    const logoPath = `/uploads/logos/${req.file.filename}`;

    const result = await pool.query(
      `
      UPDATE settings
      SET company_logo = $1,
          updated_at = NOW()
      WHERE id = 1
      RETURNING *
      `,
      [logoPath]
    );

    await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'UPLOAD_LOGO',
      module_name: 'SETTINGS',
      record_id: 1,
      description: 'Updated company logo',
      metadata: {
        company_logo: logoPath,
      },
    });

    res.json({
      success: true,
      message: 'Company logo uploaded successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Upload company logo error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to upload company logo',
    });
  }
};

module.exports = {
  getSettings,
  updateSettings,
  uploadCompanyLogo,
};