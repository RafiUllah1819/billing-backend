const pool = require('../../config/db');

// ── Profit & Loss Report ────────────────────────────────────────────────────
//
// Accepts query params: from_date, to_date (YYYY-MM-DD)
// All five queries run in parallel then the results are composed server-side.
//
exports.getProfitLoss = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({
        success: false,
        message: 'from_date and to_date are required (YYYY-MM-DD)',
      });
    }

    const [
      salesRes,
      salesReturnRes,
      purchaseRes,
      purchaseReturnRes,
      expenseRes,
      expenseCatRes,
    ] = await Promise.all([

      // Total sales (exclude cancelled)
      pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total
         FROM sales_invoices
         WHERE status != 'CANCELLED'
           AND invoice_date BETWEEN $1 AND $2`,
        [from_date, to_date]
      ),

      // Sales returns (all rows are active — no status column)
      pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total
         FROM sales_returns
         WHERE return_date BETWEEN $1 AND $2`,
        [from_date, to_date]
      ),

      // Total purchases (exclude cancelled)
      pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total
         FROM purchase_bills
         WHERE status != 'CANCELLED'
           AND bill_date BETWEEN $1 AND $2`,
        [from_date, to_date]
      ),

      // Purchase returns (all rows are active — no status column)
      pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total
         FROM purchase_returns
         WHERE return_date BETWEEN $1 AND $2`,
        [from_date, to_date]
      ),

      // Total expenses
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE expense_date BETWEEN $1 AND $2`,
        [from_date, to_date]
      ),

      // Expense breakdown by category
      pool.query(
        `SELECT category, COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE expense_date BETWEEN $1 AND $2
         GROUP BY category
         ORDER BY total DESC`,
        [from_date, to_date]
      ),
    ]);

    const totalSales     = Number(salesRes.rows[0].total);
    const salesReturns   = Number(salesReturnRes.rows[0].total);
    const netSales       = totalSales - salesReturns;

    const totalPurchases    = Number(purchaseRes.rows[0].total);
    const purchaseReturns   = Number(purchaseReturnRes.rows[0].total);
    const netPurchases      = totalPurchases - purchaseReturns;

    const grossProfit    = netSales - netPurchases;
    const totalExpenses  = Number(expenseRes.rows[0].total);
    const netProfit      = grossProfit - totalExpenses;

    res.json({
      success: true,
      data: {
        period: { from_date, to_date },

        // Revenue section
        total_sales:    totalSales,
        sales_returns:  salesReturns,
        net_sales:      netSales,

        // Cost section
        total_purchases:   totalPurchases,
        purchase_returns:  purchaseReturns,
        net_purchases:     netPurchases,

        // Profit lines
        gross_profit:   grossProfit,
        total_expenses: totalExpenses,
        net_profit:     netProfit,

        // Expense detail
        expense_breakdown: expenseCatRes.rows,
      },
    });
  } catch (error) {
    console.error('Profit & Loss report error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate Profit & Loss report',
    });
  }
};

// ── Stock Report ────────────────────────────────────────────────────────────

exports.getStockReport = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        product_code,
        title,
        category,
        sku,
        unit,
        sale_price,
        purchase_price,
        current_stock,
        min_stock_alert,
        opening_stock,
        opening_stock_rate,
        (opening_stock * opening_stock_rate) AS opening_stock_value,
        (current_stock * purchase_price)     AS stock_value
      FROM products
      WHERE is_active = true
      ORDER BY title ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to load stock report' });
  }
};