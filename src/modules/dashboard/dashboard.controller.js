const pool = require('../../config/db');

const getDashboardSummary = async (req, res) => {
  try {
    const [
      salesResult,
      purchasesResult,
      customerDueResult,
      supplierDueResult,
      lowStockResult,
    ] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total_sales FROM sales_invoices WHERE status != 'CANCELLED'`),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total_purchases FROM purchase_bills WHERE status != 'CANCELLED'`),
      pool.query(`SELECT COALESCE(SUM(due_amount), 0) AS total_customer_due FROM sales_invoices WHERE status != 'CANCELLED'`),
      pool.query(`SELECT COALESCE(SUM(due_amount), 0) AS total_supplier_due FROM purchase_bills WHERE status != 'CANCELLED'`),
      pool.query(`SELECT COUNT(*) AS low_stock_count FROM products WHERE is_active = TRUE AND min_stock_alert > 0 AND current_stock <= min_stock_alert`),
    ]);

    res.json({
      success: true,
      message: 'Dashboard summary fetched successfully',
      data: {
        total_sales:        Number(salesResult.rows[0].total_sales),
        total_purchases:    Number(purchasesResult.rows[0].total_purchases),
        total_customer_due: Number(customerDueResult.rows[0].total_customer_due),
        total_supplier_due: Number(supplierDueResult.rows[0].total_supplier_due),
        low_stock_count:    Number(lowStockResult.rows[0].low_stock_count),
      },
    });
  } catch (error) {
    console.error('Dashboard summary error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard summary' });
  }
};

const getLowStockProducts = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, product_code, title, category, sku, unit,
        current_stock, min_stock_alert, sale_price, purchase_price, image_url
      FROM products
      WHERE is_active = TRUE
        AND min_stock_alert > 0
        AND current_stock <= min_stock_alert
      ORDER BY current_stock ASC, title ASC
      LIMIT 20
    `);

    res.json({ success: true, message: 'Low stock products fetched successfully', data: result.rows });
  } catch (error) {
    console.error('Low stock products error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch low stock products' });
  }
};

const getRecentSales = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT si.id, si.invoice_no, si.invoice_date, si.total_amount,
             si.paid_amount, si.due_amount, si.status, c.customer_name
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      ORDER BY si.id DESC
      LIMIT 10
    `);
    res.json({ success: true, message: 'Recent sales fetched successfully', data: result.rows });
  } catch (error) {
    console.error('Recent sales error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch recent sales' });
  }
};

const getRecentPurchases = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT pb.id, pb.bill_no, pb.bill_date, pb.total_amount,
             pb.paid_amount, pb.due_amount, pb.status, s.supplier_name
      FROM purchase_bills pb
      JOIN suppliers s ON s.id = pb.supplier_id
      ORDER BY pb.id DESC
      LIMIT 10
    `);
    res.json({ success: true, message: 'Recent purchases fetched successfully', data: result.rows });
  } catch (error) {
    console.error('Recent purchases error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch recent purchases' });
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
        WHERE status != 'CANCELLED' AND invoice_date = CURRENT_DATE
      `),
      pool.query(`
        SELECT COALESCE(SUM(total_amount), 0) AS purchases_today
        FROM purchase_bills
        WHERE status != 'CANCELLED' AND bill_date = CURRENT_DATE
      `),
      pool.query(`
        SELECT COALESCE(SUM(due_amount), 0) AS total_receivables
        FROM sales_invoices WHERE status != 'CANCELLED'
      `),
      pool.query(`
        SELECT COALESCE(SUM(due_amount), 0) AS total_payables
        FROM purchase_bills WHERE status != 'CANCELLED'
      `),
      pool.query(`
        SELECT COUNT(*) AS low_stock_count FROM products
        WHERE is_active = TRUE AND min_stock_alert > 0 AND current_stock <= min_stock_alert
      `),
      pool.query(`
        SELECT
          TO_CHAR(months.month, 'YYYY-MM') AS month,
          COALESCE(SUM(si.total_amount), 0) AS total
        FROM generate_series(
          DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
          DATE_TRUNC('month', CURRENT_DATE),
          INTERVAL '1 month'
        ) AS months(month)
        LEFT JOIN sales_invoices si
          ON DATE_TRUNC('month', si.invoice_date) = months.month
         AND si.status != 'CANCELLED'
        GROUP BY months.month ORDER BY months.month
      `),
      pool.query(`
        SELECT
          TO_CHAR(months.month, 'YYYY-MM') AS month,
          COALESCE(SUM(pb.total_amount), 0) AS total
        FROM generate_series(
          DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
          DATE_TRUNC('month', CURRENT_DATE),
          INTERVAL '1 month'
        ) AS months(month)
        LEFT JOIN purchase_bills pb
          ON DATE_TRUNC('month', pb.bill_date) = months.month
         AND pb.status != 'CANCELLED'
        GROUP BY months.month ORDER BY months.month
      `),
      pool.query(`
        SELECT p.id, p.product_code, p.title, p.image_url,
               COALESCE(SUM(sii.quantity), 0) AS total_qty_sold
        FROM sales_invoice_items sii
        JOIN products p ON p.id = sii.product_id
        JOIN sales_invoices si ON si.id = sii.invoice_id
        WHERE si.status != 'CANCELLED'
        GROUP BY p.id, p.product_code, p.title, p.image_url
        ORDER BY total_qty_sold DESC
        LIMIT 5
      `),
    ]);

    res.json({
      success: true,
      data: {
        sales_today:      Number(salesTodayResult.rows[0].sales_today || 0),
        purchases_today:  Number(purchasesTodayResult.rows[0].purchases_today || 0),
        total_receivables:Number(receivablesResult.rows[0].total_receivables || 0),
        total_payables:   Number(payablesResult.rows[0].total_payables || 0),
        low_stock_count:  Number(lowStockResult.rows[0].low_stock_count || 0),
        monthly_sales: monthlySalesResult.rows.map((r) => ({
          month: r.month, total: Number(r.total || 0),
        })),
        monthly_purchases: monthlyPurchasesResult.rows.map((r) => ({
          month: r.month, total: Number(r.total || 0),
        })),
        top_products: topProductsResult.rows.map((r) => ({
          id: r.id, product_code: r.product_code, title: r.title,
          image_url: r.image_url, total_qty_sold: Number(r.total_qty_sold || 0),
        })),
      },
    });
  } catch (error) {
    console.error('Dashboard analytics error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard analytics' });
  }
};

const getLowStockAlerts = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, product_code, title, category, sku, unit,
             current_stock, min_stock_alert, image_url
      FROM products
      WHERE is_active = TRUE
        AND min_stock_alert > 0
        AND current_stock <= min_stock_alert
      ORDER BY current_stock ASC, title ASC
      LIMIT 10
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get low stock alerts error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch low stock alerts' });
  }
};

const getMonthlySalesChart = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT TO_CHAR(months.month_date, 'Mon YYYY') AS month,
             COALESCE(SUM(si.total_amount), 0) AS total_sales
      FROM generate_series(
        date_trunc('month', CURRENT_DATE) - interval '5 months',
        date_trunc('month', CURRENT_DATE),
        interval '1 month'
      ) AS months(month_date)
      LEFT JOIN sales_invoices si
        ON date_trunc('month', si.invoice_date) = months.month_date
       AND si.status != 'CANCELLED'
      GROUP BY months.month_date ORDER BY months.month_date ASC
    `);
    res.json({
      success: true,
      data: result.rows.map((r) => ({ month: r.month, total_sales: Number(r.total_sales || 0) })),
    });
  } catch (error) {
    console.error('Get monthly sales chart error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch monthly sales chart' });
  }
};

const getMonthlyPurchasesChart = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT TO_CHAR(months.month_date, 'Mon YYYY') AS month,
             COALESCE(SUM(pb.total_amount), 0) AS total_purchases
      FROM generate_series(
        date_trunc('month', CURRENT_DATE) - interval '5 months',
        date_trunc('month', CURRENT_DATE),
        interval '1 month'
      ) AS months(month_date)
      LEFT JOIN purchase_bills pb
        ON date_trunc('month', pb.bill_date) = months.month_date
       AND pb.status != 'CANCELLED'
      GROUP BY months.month_date ORDER BY months.month_date ASC
    `);
    res.json({
      success: true,
      data: result.rows.map((r) => ({ month: r.month, total_purchases: Number(r.total_purchases || 0) })),
    });
  } catch (error) {
    console.error('Get monthly purchases chart error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch monthly purchases chart' });
  }
};

const getTopSellingProducts = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.product_code, p.title, p.image_url,
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
      data: result.rows.map((r) => ({ ...r, total_sold: Number(r.total_sold || 0) })),
    });
  } catch (error) {
    console.error('Get top selling products error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch top selling products' });
  }
};

// ── Single comprehensive endpoint used by the new dashboard ─────────────────
const getDashboardOverview = async (req, res) => {
  try {
    let { from_date, to_date } = req.query;

    // Default: current month
    if (!from_date || !to_date) {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      if (!from_date) from_date = `${y}-${m}-01`;
      if (!to_date)   to_date   = `${y}-${m}-${d}`;
    }

    const runQuery = async (label, fn) => {
      try {
        return await fn();
      } catch (e) {
        console.error(`Dashboard overview – query FAILED [${label}]:`, e.message);
        throw e;
      }
    };

    const [
      salesRes,
      purchasesRes,
      expensesRes,
      receivablesRes,
      payablesRes,
      lowStockRes,
      recentInvoicesRes,
      recentPurchasesRes,
      recentPaymentsRes,
      topCustomersRes,
      topProductsRes,
      trendRes,
    ] = await Promise.all([

      // Period sales
      runQuery('sales', () => pool.query(`
        SELECT
          COALESCE(SUM(total_amount), 0)  AS total,
          COALESCE(SUM(paid_amount),  0)  AS paid,
          COALESCE(SUM(due_amount),   0)  AS due,
          COUNT(*)                        AS count
        FROM sales_invoices
        WHERE status != 'CANCELLED'
          AND invoice_date BETWEEN $1 AND $2
      `, [from_date, to_date])),

      // Period purchases
      runQuery('purchases', () => pool.query(`
        SELECT
          COALESCE(SUM(total_amount), 0)  AS total,
          COALESCE(SUM(paid_amount),  0)  AS paid,
          COALESCE(SUM(due_amount),   0)  AS due,
          COUNT(*)                        AS count
        FROM purchase_bills
        WHERE status != 'CANCELLED'
          AND bill_date BETWEEN $1 AND $2
      `, [from_date, to_date])),

      // Period expenses
      runQuery('expenses', () => pool.query(`
        SELECT
          COALESCE(SUM(amount), 0) AS total,
          COUNT(*)                 AS count
        FROM expenses
        WHERE expense_date BETWEEN $1 AND $2
      `, [from_date, to_date])),

      // All-time outstanding receivables
      runQuery('receivables', () => pool.query(`
        SELECT
          COALESCE(SUM(due_amount), 0) AS total,
          COUNT(*) FILTER (WHERE due_amount > 0) AS invoice_count
        FROM sales_invoices
        WHERE status != 'CANCELLED' AND due_amount > 0
      `)),

      // All-time outstanding payables
      runQuery('payables', () => pool.query(`
        SELECT
          COALESCE(SUM(due_amount), 0) AS total,
          COUNT(*) FILTER (WHERE due_amount > 0) AS bill_count
        FROM purchase_bills
        WHERE status != 'CANCELLED' AND due_amount > 0
      `)),

      // Low stock items
      runQuery('low_stock', () => pool.query(`
        SELECT id, product_code, title, category, unit, current_stock, min_stock_alert, image_url
        FROM products
        WHERE is_active = TRUE AND min_stock_alert > 0 AND current_stock <= min_stock_alert
        ORDER BY current_stock ASC, title ASC
        LIMIT 10
      `)),

      // Recent 8 invoices (not period-filtered)
      runQuery('recent_invoices', () => pool.query(`
        SELECT si.id, si.invoice_no, si.invoice_date, si.total_amount, si.due_amount, si.status,
               c.customer_name
        FROM sales_invoices si
        JOIN customers c ON c.id = si.customer_id
        ORDER BY si.id DESC LIMIT 8
      `)),

      // Recent 8 purchases (not period-filtered)
      runQuery('recent_purchases', () => pool.query(`
        SELECT pb.id, pb.bill_no, pb.bill_date, pb.total_amount, pb.due_amount, pb.status,
               s.supplier_name
        FROM purchase_bills pb
        JOIN suppliers s ON s.id = pb.supplier_id
        ORDER BY pb.id DESC LIMIT 8
      `)),

      // Recent 8 payments (not period-filtered)
      runQuery('recent_payments', () => pool.query(`
        SELECT p.id, p.payment_date, p.payment_type, p.amount, p.payment_method,
               c.customer_name, s.supplier_name
        FROM payments p
        LEFT JOIN customers c ON c.id = p.customer_id
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        ORDER BY p.id DESC LIMIT 8
      `)),

      // Top 5 customers for period
      runQuery('top_customers', () => pool.query(`
        SELECT c.id, c.customer_name, c.customer_code,
               COALESCE(SUM(si.total_amount), 0) AS total_sales,
               COUNT(si.id)                       AS invoice_count
        FROM customers c
        JOIN sales_invoices si ON si.customer_id = c.id
        WHERE si.status != 'CANCELLED'
          AND si.invoice_date BETWEEN $1 AND $2
        GROUP BY c.id, c.customer_name, c.customer_code
        ORDER BY total_sales DESC LIMIT 5
      `, [from_date, to_date])),

      // Top 5 products for period
      runQuery('top_products', () => pool.query(`
        SELECT p.id, p.product_code, p.title, p.image_url,
               COALESCE(SUM(sii.quantity),   0) AS total_qty,
               COALESCE(SUM(sii.line_total), 0) AS total_revenue
        FROM sales_invoice_items sii
        JOIN products p        ON p.id  = sii.product_id
        JOIN sales_invoices si ON si.id = sii.invoice_id
        WHERE si.status != 'CANCELLED'
          AND si.invoice_date BETWEEN $1 AND $2
        GROUP BY p.id, p.product_code, p.title, p.image_url
        ORDER BY total_qty DESC LIMIT 5
      `, [from_date, to_date])),

      // Last 6 months combined trend (always, for the chart)
      runQuery('trend', () => pool.query(`
        SELECT
          TO_CHAR(m.month, 'Mon YY') AS month,
          COALESCE(s.sales,     0)   AS sales,
          COALESCE(p.purchases, 0)   AS purchases
        FROM generate_series(
          DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
          DATE_TRUNC('month', CURRENT_DATE),
          INTERVAL '1 month'
        ) AS m(month)
        LEFT JOIN (
          SELECT DATE_TRUNC('month', invoice_date) AS mo, SUM(total_amount) AS sales
          FROM sales_invoices WHERE status != 'CANCELLED' GROUP BY 1
        ) s ON s.mo = m.month
        LEFT JOIN (
          SELECT DATE_TRUNC('month', bill_date) AS mo, SUM(total_amount) AS purchases
          FROM purchase_bills WHERE status != 'CANCELLED' GROUP BY 1
        ) p ON p.mo = m.month
        ORDER BY m.month
      `)),
    ]);

    const totalSales     = Number(salesRes.rows[0].total     || 0);
    const totalPurchases = Number(purchasesRes.rows[0].total || 0);
    const totalExpenses  = Number(expensesRes.rows[0].total  || 0);
    const grossProfit    = totalSales - totalPurchases;
    const netProfit      = grossProfit - totalExpenses;

    res.json({
      success: true,
      data: {
        period: { from_date, to_date },

        sales: {
          total:   totalSales,
          paid:    Number(salesRes.rows[0].paid  || 0),
          due:     Number(salesRes.rows[0].due   || 0),
          count:   Number(salesRes.rows[0].count || 0),
        },
        purchases: {
          total:  totalPurchases,
          paid:   Number(purchasesRes.rows[0].paid  || 0),
          due:    Number(purchasesRes.rows[0].due   || 0),
          count:  Number(purchasesRes.rows[0].count || 0),
        },
        expenses: {
          total: totalExpenses,
          count: Number(expensesRes.rows[0].count || 0),
        },
        profit: {
          gross_profit:  grossProfit,
          net_profit:    netProfit,
          total_expenses: totalExpenses,
        },
        receivables: {
          total:         Number(receivablesRes.rows[0].total         || 0),
          invoice_count: Number(receivablesRes.rows[0].invoice_count || 0),
        },
        payables: {
          total:      Number(payablesRes.rows[0].total      || 0),
          bill_count: Number(payablesRes.rows[0].bill_count || 0),
        },
        low_stock: {
          count: lowStockRes.rows.length,
          items: lowStockRes.rows,
        },
        recent_invoices:  recentInvoicesRes.rows,
        recent_purchases: recentPurchasesRes.rows,
        recent_payments:  recentPaymentsRes.rows,
        top_customers:    topCustomersRes.rows.map((r) => ({
          ...r,
          total_sales:   Number(r.total_sales   || 0),
          invoice_count: Number(r.invoice_count || 0),
        })),
        top_products: topProductsRes.rows.map((r) => ({
          ...r,
          total_qty:     Number(r.total_qty     || 0),
          total_revenue: Number(r.total_revenue || 0),
        })),
        trend: trendRes.rows.map((r) => ({
          month:     r.month,
          sales:     Number(r.sales     || 0),
          purchases: Number(r.purchases || 0),
        })),
      },
    });
  } catch (error) {
    console.error('Dashboard overview error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard overview' });
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
  getDashboardOverview,
};
