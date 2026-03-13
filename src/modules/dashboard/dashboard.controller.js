const pool = require('../../config/db');

const getDashboardSummary = async (req, res) => {
  try {
    const totalSalesQuery = `
      SELECT COALESCE(SUM(total_amount), 0) AS total_sales
      FROM sales_invoices
      WHERE status = 'COMPLETED'
    `;

    const totalPurchasesQuery = `
      SELECT COALESCE(SUM(total_amount), 0) AS total_purchases
      FROM purchase_bills
      WHERE status = 'COMPLETED'
    `;

    const totalCustomerDueQuery = `
      SELECT COALESCE(SUM(due_amount), 0) AS total_customer_due
      FROM sales_invoices
      WHERE status = 'COMPLETED'
    `;

    const totalSupplierDueQuery = `
      SELECT COALESCE(SUM(due_amount), 0) AS total_supplier_due
      FROM purchase_bills
      WHERE status = 'COMPLETED'
    `;

    const lowStockQuery = `
      SELECT COUNT(*) AS low_stock_count
      FROM products
      WHERE current_stock <= min_stock_alert
      AND is_active = TRUE
    `;

    const [salesResult, purchasesResult, customerDueResult, supplierDueResult, lowStockResult] =
      await Promise.all([
        pool.query(totalSalesQuery),
        pool.query(totalPurchasesQuery),
        pool.query(totalCustomerDueQuery),
        pool.query(totalSupplierDueQuery),
        pool.query(lowStockQuery),
      ]);

    res.json({
      success: true,
      message: 'Dashboard summary fetched successfully',
      data: {
        total_sales: Number(salesResult.rows[0].total_sales),
        total_purchases: Number(purchasesResult.rows[0].total_purchases),
        total_customer_due: Number(customerDueResult.rows[0].total_customer_due),
        total_supplier_due: Number(supplierDueResult.rows[0].total_supplier_due),
        low_stock_count: Number(lowStockResult.rows[0].low_stock_count),
      },
    });
  } catch (error) {
    console.error('Dashboard summary error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard summary',
      error: error.message,
    });
  }
};

const getLowStockProducts = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        product_code,
        title,
        unit,
        current_stock,
        min_stock_alert,
        sale_price,
        purchase_price
      FROM products
      WHERE current_stock <= min_stock_alert
      AND is_active = TRUE
      ORDER BY current_stock ASC, id DESC
    `);

    res.json({
      success: true,
      message: 'Low stock products fetched successfully',
      data: result.rows,
    });
  } catch (error) {
    console.error('Low stock products error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch low stock products',
      error: error.message,
    });
  }
};

const getRecentSales = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        si.id,
        si.invoice_no,
        si.invoice_date,
        si.total_amount,
        si.paid_amount,
        si.due_amount,
        si.status,
        c.customer_name
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      ORDER BY si.id DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      message: 'Recent sales fetched successfully',
      data: result.rows,
    });
  } catch (error) {
    console.error('Recent sales error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent sales',
      error: error.message,
    });
  }
};

const getRecentPurchases = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        pb.id,
        pb.bill_no,
        pb.bill_date,
        pb.total_amount,
        pb.paid_amount,
        pb.due_amount,
        pb.status,
        s.supplier_name
      FROM purchase_bills pb
      JOIN suppliers s ON s.id = pb.supplier_id
      ORDER BY pb.id DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      message: 'Recent purchases fetched successfully',
      data: result.rows,
    });
  } catch (error) {
    console.error('Recent purchases error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent purchases',
      error: error.message,
    });
  }
};

const getDashboardAnalytics = async (req, res) => {
  try {
    const [
      salesTodayResult,
      purchasesTodayResult,
      receivablesResult,
      payablesResult,
      lowStockResult,
      monthlySalesResult,
      monthlyPurchasesResult,
      topProductsResult,
    ] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(total_amount), 0) AS sales_today
        FROM sales_invoices
        WHERE status = 'COMPLETED'
          AND invoice_date = CURRENT_DATE
      `),

      pool.query(`
        SELECT COALESCE(SUM(total_amount), 0) AS purchases_today
        FROM purchase_bills
        WHERE status = 'COMPLETED'
          AND bill_date = CURRENT_DATE
      `),

      pool.query(`
        SELECT COALESCE(SUM(due_amount), 0) AS total_receivables
        FROM sales_invoices
        WHERE status = 'COMPLETED'
      `),

      pool.query(`
        SELECT COALESCE(SUM(due_amount), 0) AS total_payables
        FROM purchase_bills
        WHERE status = 'COMPLETED'
      `),

      pool.query(`
        SELECT COUNT(*) AS low_stock_count
        FROM products
        WHERE is_active = TRUE
          AND current_stock <= min_stock_alert
      `),

      pool.query(`
          SELECT
          TO_CHAR(months.month, 'YYYY-MM') AS month,
          COALESCE(SUM(si.total_amount), 0) AS total
        FROM
          generate_series(
            DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
            DATE_TRUNC('month', CURRENT_DATE),
            INTERVAL '1 month'
          ) AS months(month)
        LEFT JOIN sales_invoices si
          ON DATE_TRUNC('month', si.invoice_date) = months.month
          AND si.status = 'COMPLETED'
        GROUP BY months.month
        ORDER BY months.month
      `),

      pool.query(`
       SELECT
          TO_CHAR(months.month, 'YYYY-MM') AS month,
          COALESCE(SUM(pb.total_amount), 0) AS total
        FROM
          generate_series(
            DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
            DATE_TRUNC('month', CURRENT_DATE),
            INTERVAL '1 month'
          ) AS months(month)
        LEFT JOIN purchase_bills pb
          ON DATE_TRUNC('month', pb.bill_date) = months.month
          AND pb.status = 'COMPLETED'
        GROUP BY months.month
        ORDER BY months.month
      `),

      pool.query(`
        SELECT
          p.id,
          p.product_code,
          p.title,
          COALESCE(SUM(sii.quantity), 0) AS total_qty_sold
        FROM sales_invoice_items sii
        JOIN products p ON p.id = sii.product_id
        JOIN sales_invoices si ON si.id = sii.invoice_id
        WHERE si.status = 'COMPLETED'
        GROUP BY p.id, p.product_code, p.title
        ORDER BY total_qty_sold DESC
        LIMIT 5
      `),
    ]);

    res.json({
      success: true,
      data: {
        sales_today: Number(salesTodayResult.rows[0].sales_today || 0),
        purchases_today: Number(purchasesTodayResult.rows[0].purchases_today || 0),
        total_receivables: Number(receivablesResult.rows[0].total_receivables || 0),
        total_payables: Number(payablesResult.rows[0].total_payables || 0),
        low_stock_count: Number(lowStockResult.rows[0].low_stock_count || 0),
        monthly_sales: monthlySalesResult.rows.map((row) => ({
          month: row.month,
          total: Number(row.total || 0),
        })),
        monthly_purchases: monthlyPurchasesResult.rows.map((row) => ({
          month: row.month,
          total: Number(row.total || 0),
        })),
        top_products: topProductsResult.rows.map((row) => ({
          id: row.id,
          product_code: row.product_code,
          title: row.title,
          total_qty_sold: Number(row.total_qty_sold || 0),
        })),
      },
    });
  } catch (error) {
    console.error('Dashboard analytics error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard analytics',
      error: error.message,
    });
  }
};

const getLowStockAlerts = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        product_code,
        title,
        current_stock,
        min_stock_alert,
        image_url
      FROM products
      WHERE is_active = TRUE
        AND current_stock <= min_stock_alert
      ORDER BY current_stock ASC, title ASC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get low stock alerts error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch low stock alerts',
      error: error.message,
    });
  }
};

const getMonthlySalesChart = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(months.month_date, 'Mon YYYY') AS month,
        COALESCE(SUM(si.total_amount), 0) AS total_sales
      FROM generate_series(
        date_trunc('month', CURRENT_DATE) - interval '5 months',
        date_trunc('month', CURRENT_DATE),
        interval '1 month'
      ) AS months(month_date)
      LEFT JOIN sales_invoices si
        ON date_trunc('month', si.invoice_date) = months.month_date
       AND si.status != 'CANCELLED'
      GROUP BY months.month_date
      ORDER BY months.month_date ASC
    `);

    res.json({
      success: true,
      data: result.rows.map((row) => ({
        month: row.month,
        total_sales: Number(row.total_sales || 0),
      })),
    });
  } catch (error) {
    console.error('Get monthly sales chart error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch monthly sales chart',
      error: error.message,
    });
  }
};

const getMonthlyPurchasesChart = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(months.month_date, 'Mon YYYY') AS month,
        COALESCE(SUM(pb.total_amount), 0) AS total_purchases
      FROM generate_series(
        date_trunc('month', CURRENT_DATE) - interval '5 months',
        date_trunc('month', CURRENT_DATE),
        interval '1 month'
      ) AS months(month_date)
      LEFT JOIN purchase_bills pb
        ON date_trunc('month', pb.bill_date) = months.month_date
       AND pb.status != 'CANCELLED'
      GROUP BY months.month_date
      ORDER BY months.month_date ASC
    `);

    res.json({
      success: true,
      data: result.rows.map((row) => ({
        month: row.month,
        total_purchases: Number(row.total_purchases || 0),
      })),
    });
  } catch (error) {
    console.error('Get monthly purchases chart error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch monthly purchases chart',
      error: error.message,
    });
  }
};

const getTopSellingProducts = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        p.product_code,
        p.title,
        p.image_url,
        COALESCE(SUM(sii.quantity), 0) AS total_sold
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON si.id = sii.invoice_id
      JOIN products p ON p.id = sii.product_id
      WHERE si.status != 'CANCELLED'
      GROUP BY p.id, p.product_code, p.title, p.image_url
      ORDER BY total_sold DESC, p.title ASC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: result.rows.map((row) => ({
        ...row,
        total_sold: Number(row.total_sold || 0),
      })),
    });
  } catch (error) {
    console.error('Get top selling products error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top selling products',
      error: error.message,
    });
  }
};


module.exports = {
  getDashboardSummary,
  getLowStockProducts,
  getRecentSales,
  getRecentPurchases,
  getDashboardAnalytics,
  getLowStockAlerts,
  getMonthlySalesChart,
  getMonthlyPurchasesChart,
  getTopSellingProducts,
};