const pool = require('../../config/db');

const getCustomerAgingReport = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        si.id,
        si.invoice_no,
        si.invoice_date,
        si.customer_id,
        c.customer_name,
        si.total_amount,
        si.paid_amount,
        si.due_amount,
        GREATEST(CURRENT_DATE - si.invoice_date, 0) AS age_days,
        CASE
          WHEN (CURRENT_DATE - si.invoice_date) BETWEEN 0 AND 30 THEN si.due_amount
          ELSE 0
        END AS bucket_0_30,
        CASE
          WHEN (CURRENT_DATE - si.invoice_date) BETWEEN 31 AND 60 THEN si.due_amount
          ELSE 0
        END AS bucket_31_60,
        CASE
          WHEN (CURRENT_DATE - si.invoice_date) BETWEEN 61 AND 90 THEN si.due_amount
          ELSE 0
        END AS bucket_61_90,
        CASE
          WHEN (CURRENT_DATE - si.invoice_date) > 90 THEN si.due_amount
          ELSE 0
        END AS bucket_90_plus
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      WHERE si.status != 'CANCELLED'
        AND si.due_amount > 0
      ORDER BY age_days DESC, si.invoice_date ASC
    `);

    const summary = result.rows.reduce(
      (acc, row) => {
        acc.total_due += Number(row.due_amount || 0);
        acc.bucket_0_30 += Number(row.bucket_0_30 || 0);
        acc.bucket_31_60 += Number(row.bucket_31_60 || 0);
        acc.bucket_61_90 += Number(row.bucket_61_90 || 0);
        acc.bucket_90_plus += Number(row.bucket_90_plus || 0);
        return acc;
      },
      {
        total_due: 0,
        bucket_0_30: 0,
        bucket_31_60: 0,
        bucket_61_90: 0,
        bucket_90_plus: 0,
      }
    );

    res.json({
      success: true,
      data: {
        summary,
        rows: result.rows.map((row) => ({
          ...row,
          total_amount: Number(row.total_amount || 0),
          paid_amount: Number(row.paid_amount || 0),
          due_amount: Number(row.due_amount || 0),
          age_days: Number(row.age_days || 0),
          bucket_0_30: Number(row.bucket_0_30 || 0),
          bucket_31_60: Number(row.bucket_31_60 || 0),
          bucket_61_90: Number(row.bucket_61_90 || 0),
          bucket_90_plus: Number(row.bucket_90_plus || 0),
        })),
      },
    });
  } catch (error) {
    console.error('Get customer aging report error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer aging report',
      error: error.message,
    });
  }
};

const getSupplierAgingReport = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        pb.id,
        pb.bill_no,
        pb.bill_date,
        pb.supplier_id,
        s.supplier_name,
        pb.total_amount,
        pb.paid_amount,
        pb.due_amount,
        GREATEST(CURRENT_DATE - pb.bill_date, 0) AS age_days,
        CASE
          WHEN (CURRENT_DATE - pb.bill_date) BETWEEN 0 AND 30 THEN pb.due_amount
          ELSE 0
        END AS bucket_0_30,
        CASE
          WHEN (CURRENT_DATE - pb.bill_date) BETWEEN 31 AND 60 THEN pb.due_amount
          ELSE 0
        END AS bucket_31_60,
        CASE
          WHEN (CURRENT_DATE - pb.bill_date) BETWEEN 61 AND 90 THEN pb.due_amount
          ELSE 0
        END AS bucket_61_90,
        CASE
          WHEN (CURRENT_DATE - pb.bill_date) > 90 THEN pb.due_amount
          ELSE 0
        END AS bucket_90_plus
      FROM purchase_bills pb
      JOIN suppliers s ON s.id = pb.supplier_id
      WHERE pb.status != 'CANCELLED'
        AND pb.due_amount > 0
      ORDER BY age_days DESC, pb.bill_date ASC
    `);

    const summary = result.rows.reduce(
      (acc, row) => {
        acc.total_due += Number(row.due_amount || 0);
        acc.bucket_0_30 += Number(row.bucket_0_30 || 0);
        acc.bucket_31_60 += Number(row.bucket_31_60 || 0);
        acc.bucket_61_90 += Number(row.bucket_61_90 || 0);
        acc.bucket_90_plus += Number(row.bucket_90_plus || 0);
        return acc;
      },
      {
        total_due: 0,
        bucket_0_30: 0,
        bucket_31_60: 0,
        bucket_61_90: 0,
        bucket_90_plus: 0,
      }
    );

    res.json({
      success: true,
      data: {
        summary,
        rows: result.rows.map((row) => ({
          ...row,
          total_amount: Number(row.total_amount || 0),
          paid_amount: Number(row.paid_amount || 0),
          due_amount: Number(row.due_amount || 0),
          age_days: Number(row.age_days || 0),
          bucket_0_30: Number(row.bucket_0_30 || 0),
          bucket_31_60: Number(row.bucket_31_60 || 0),
          bucket_61_90: Number(row.bucket_61_90 || 0),
          bucket_90_plus: Number(row.bucket_90_plus || 0),
        })),
      },
    });
  } catch (error) {
    console.error('Get supplier aging report error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch supplier aging report',
      error: error.message,
    });
  }
};

module.exports = {
  getCustomerAgingReport,
  getSupplierAgingReport,
};