const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { createAuditLog } = require('../../utils/audit.helper');

const backupsDir = path.join(__dirname, '..', '..', 'backups');

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

const createDatabaseBackup = async (req, res) => {
  try {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
      return res.status(500).json({
        success: false,
        message: 'DATABASE_URL is not configured',
      });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);

    const filename = `backup_${timestamp}.sql`;
    const filePath = path.join(backupsDir, filename);

    const command = `pg_dump "${dbUrl}" > "${filePath}"`;

    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error('Backup command error:', error.message);
        return res.status(500).json({
          success: false,
          message: 'Failed to create database backup',
          error: error.message,
        });
      }

      try {
        const stats = fs.statSync(filePath);

        await createAuditLog({
          user_id: req.user?.id || null,
          action_type: 'CREATE_BACKUP',
          module_name: 'BACKUP',
          record_id: null,
          description: `Created database backup ${filename}`,
          metadata: {
            filename,
            size_bytes: stats.size,
          },
        });

        res.json({
          success: true,
          message: 'Database backup created successfully',
          data: {
            filename,
            size_bytes: stats.size,
            created_at: stats.birthtime,
          },
        });
      } catch (auditError) {
        console.error('Backup audit error:', auditError.message);
        res.json({
          success: true,
          message: 'Database backup created successfully',
          data: {
            filename,
          },
        });
      }
    });
  } catch (error) {
    console.error('Create backup error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create backup',
      error: error.message,
    });
  }
};

const getBackupFiles = async (req, res) => {
  try {
    const files = fs
      .readdirSync(backupsDir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => {
        const filePath = path.join(backupsDir, file);
        const stats = fs.statSync(filePath);

        return {
          filename: file,
          size_bytes: stats.size,
          created_at: stats.birthtime,
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      data: files,
    });
  } catch (error) {
    console.error('Get backup files error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch backup files',
      error: error.message,
    });
  }
};

const downloadBackupFile = async (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename.endsWith('.sql')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup filename',
      });
    }

    const safeFilename = path.basename(filename);
    const filePath = path.join(backupsDir, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Backup file not found',
      });
    }

    await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'DOWNLOAD_BACKUP',
      module_name: 'BACKUP',
      record_id: null,
      description: `Downloaded database backup ${safeFilename}`,
      metadata: {
        filename: safeFilename,
      },
    });

    res.download(filePath, safeFilename);
  } catch (error) {
    console.error('Download backup error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to download backup',
      error: error.message,
    });
  }
};

module.exports = {
  createDatabaseBackup,
  getBackupFiles,
  downloadBackupFile,
};