const pool = require('../../config/db');
const { createAuditLog } = require('../../utils/audit.helper');



const round2 = (value) => Number(Number(value).toFixed(2));

// Allowed payment methods — used for validation in both customer and supplier payments
const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Cheque', 'JazzCash', 'EasyPaisa'];

const receiveCustomerPayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      customer_id,
      amount,
      payment_date,
      payment_method,
      reference_no = null,
      remarks,
      reference_id = null,
      reference_type = 'CUSTOMER_PAYMENT',
      allocations = [],
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        message: 'Customer is required',
      });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid payment amount is required',
      });
    }

    if (payment_method && !PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment method. Allowed: ${PAYMENT_METHODS.join(', ')}`,
      });
    }

    const paymentAmount = round2(Number(amount));

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one invoice allocation is required',
      });
    }

    const totalAllocated = round2(
      allocations.reduce((sum, item) => sum + Number(item.allocated_amount || 0), 0)
    );

    if (totalAllocated !== paymentAmount) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (${paymentAmount}) must exactly match total allocated amount (${totalAllocated})`,
      });
    }

    await client.query('BEGIN');

    const customerResult = await client.query(
      `SELECT id, customer_name
       FROM customers
       WHERE id = $1
       LIMIT 1`,
      [customer_id]
    );

    if (customerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const paymentResult = await client.query(
      `INSERT INTO payments (
        payment_type,
        reference_type,
        reference_id,
        customer_id,
        amount,
        payment_method,
        reference_no,
        payment_date,
        remarks,
        created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        'CUSTOMER_RECEIPT',
        reference_type,
        reference_id,
        customer_id,
        paymentAmount,
        payment_method || null,
        reference_no || null,
        payment_date || new Date(),
        remarks || null,
        req.user?.id || null,
      ]
    );

    const payment = paymentResult.rows[0];

    for (const allocation of allocations) {
      const invoiceId = Number(allocation.invoice_id);
      const allocatedAmount = round2(Number(allocation.allocated_amount || 0));

      if (!invoiceId || allocatedAmount <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Each allocation must have valid invoice_id and allocated_amount',
        });
      }

      const invoiceResult = await client.query(
        `SELECT id, invoice_no, customer_id, total_amount, paid_amount, due_amount, status
         FROM sales_invoices
         WHERE id = $1
         LIMIT 1`,
        [invoiceId]
      );

      if (invoiceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: `Invoice ${invoiceId} not found`,
        });
      }

      const invoice = invoiceResult.rows[0];

      if (Number(invoice.customer_id) !== Number(customer_id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Invoice ${invoice.invoice_no} does not belong to this customer`,
        });
      }

      if (invoice.status === 'CANCELLED') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Cannot allocate payment to cancelled invoice ${invoice.invoice_no}`,
        });
      }

      const currentDue = round2(Number(invoice.due_amount || 0));
      const currentPaid = round2(Number(invoice.paid_amount || 0));

      if (allocatedAmount > currentDue) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Allocated amount cannot exceed due amount for invoice ${invoice.invoice_no}`,
        });
      }

      const newPaidAmount = round2(currentPaid + allocatedAmount);
      const newDueAmount = round2(currentDue - allocatedAmount);

      let newStatus = invoice.status;
      if (newDueAmount <= 0) {
        newStatus = 'PAID';
      } else if (newPaidAmount > 0) {
        newStatus = 'PARTIAL';
      }

      await client.query(
        `INSERT INTO invoice_payments (
          payment_id,
          invoice_id,
          allocated_amount
        )
        VALUES ($1,$2,$3)`,
        [payment.id, invoiceId, allocatedAmount]
      );

      await client.query(
        `UPDATE sales_invoices
         SET paid_amount = $1,
             due_amount = $2,
             status = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [newPaidAmount, newDueAmount, newStatus, invoiceId]
      );
    }

    const lastLedgerResult = await client.query(
      `SELECT balance
       FROM customer_ledger
       WHERE customer_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [customer_id]
    );

    const previousBalance =
      lastLedgerResult.rows.length > 0
        ? Number(lastLedgerResult.rows[0].balance || 0)
        : 0;

    const newBalance = round2(previousBalance - paymentAmount);

    await client.query(
      `INSERT INTO customer_ledger (
        customer_id,
        entry_date,
        reference_type,
        reference_id,
        debit,
        credit,
        balance,
        remarks,
        created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        customer_id,
        payment_date || new Date(),
        'CUSTOMER_PAYMENT',
        payment.id,
        0,
        paymentAmount,
        newBalance,
        remarks || 'Customer payment received',
        req.user?.id || null,
      ]
    );

    await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'RECEIVE_PAYMENT',
      module_name: 'CUSTOMER_PAYMENT',
      record_id: payment.id,
      description: `Received allocated payment from customer ID ${customer_id}`,
      metadata: {
        customer_id,
        amount: paymentAmount,
        payment_method,
        allocations,
      },
      client,
    });

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Customer payment recorded and allocated successfully',
      data: payment,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Receive customer payment error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to record customer payment',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const paySupplierPayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      supplier_id,
      amount,
      payment_date,
      payment_method,
      reference_no = null,
      remarks,
      reference_id = null,
      reference_type = 'SUPPLIER_PAYMENT',
      allocations = [],
    } = req.body;

    if (!supplier_id) {
      return res.status(400).json({
        success: false,
        message: 'Supplier is required',
      });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid payment amount is required',
      });
    }

    if (payment_method && !PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment method. Allowed: ${PAYMENT_METHODS.join(', ')}`,
      });
    }

    const paymentAmount = round2(Number(amount));

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one bill allocation is required',
      });
    }

    const totalAllocated = round2(
      allocations.reduce((sum, item) => sum + Number(item.allocated_amount || 0), 0)
    );

    if (totalAllocated !== paymentAmount) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (${paymentAmount}) must exactly match total allocated amount (${totalAllocated})`,
      });
    }

    await client.query('BEGIN');

    const supplierResult = await client.query(
      `SELECT id, supplier_name
       FROM suppliers
       WHERE id = $1
       LIMIT 1`,
      [supplier_id]
    );

    if (supplierResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Supplier not found',
      });
    }

    const paymentResult = await client.query(
      `INSERT INTO payments (
        payment_type,
        reference_type,
        reference_id,
        supplier_id,
        amount,
        payment_method,
        reference_no,
        payment_date,
        remarks,
        created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        'SUPPLIER_PAYMENT',
        reference_type,
        reference_id,
        supplier_id,
        paymentAmount,
        payment_method || null,
        reference_no || null,
        payment_date || new Date(),
        remarks || null,
        req.user?.id || null,
      ]
    );

    const payment = paymentResult.rows[0];

    for (const allocation of allocations) {
      const billId = Number(allocation.purchase_bill_id);
      const allocatedAmount = round2(Number(allocation.allocated_amount || 0));

      if (!billId || allocatedAmount <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Each allocation must have valid purchase_bill_id and allocated_amount',
        });
      }

      const billResult = await client.query(
        `SELECT id, bill_no, supplier_id, total_amount, paid_amount, due_amount, status
         FROM purchase_bills
         WHERE id = $1
         LIMIT 1`,
        [billId]
      );

      if (billResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: `Purchase bill ${billId} not found`,
        });
      }

      const bill = billResult.rows[0];

      if (Number(bill.supplier_id) !== Number(supplier_id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Bill ${bill.bill_no} does not belong to this supplier`,
        });
      }

      if (bill.status === 'CANCELLED') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Cannot allocate payment to cancelled bill ${bill.bill_no}`,
        });
      }

      const currentDue = round2(Number(bill.due_amount || 0));
      const currentPaid = round2(Number(bill.paid_amount || 0));

      if (allocatedAmount > currentDue) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Allocated amount cannot exceed due amount for bill ${bill.bill_no}`,
        });
      }

      const newPaidAmount = round2(currentPaid + allocatedAmount);
      const newDueAmount = round2(currentDue - allocatedAmount);

      let newStatus = bill.status;
      if (newDueAmount <= 0) {
        newStatus = 'PAID';
      } else if (newPaidAmount > 0) {
        newStatus = 'PARTIAL';
      }

      await client.query(
        `INSERT INTO purchase_bill_payments (
          payment_id,
          purchase_bill_id,
          allocated_amount
        )
        VALUES ($1,$2,$3)`,
        [payment.id, billId, allocatedAmount]
      );

      await client.query(
        `UPDATE purchase_bills
         SET paid_amount = $1,
             due_amount = $2,
             status = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [newPaidAmount, newDueAmount, newStatus, billId]
      );
    }

    const lastLedgerResult = await client.query(
      `SELECT balance
       FROM supplier_ledger
       WHERE supplier_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [supplier_id]
    );

    const previousBalance =
      lastLedgerResult.rows.length > 0
        ? Number(lastLedgerResult.rows[0].balance || 0)
        : 0;

    const newBalance = round2(previousBalance - paymentAmount);

    await client.query(
      `INSERT INTO supplier_ledger (
        supplier_id,
        entry_date,
        reference_type,
        reference_id,
        debit,
        credit,
        balance,
        remarks,
        created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        supplier_id,
        payment_date || new Date(),
        'SUPPLIER_PAYMENT',
        payment.id,
        0,
        paymentAmount,
        newBalance,
        remarks || 'Payment made to supplier',
        req.user?.id || null,
      ]
    );

    await createAuditLog({
      user_id: req.user?.id || null,
      action_type: 'PAY_PAYMENT',
      module_name: 'SUPPLIER_PAYMENT',
      record_id: payment.id,
      description: `Paid allocated payment to supplier ID ${supplier_id}`,
      metadata: {
        supplier_id,
        amount: paymentAmount,
        payment_method,
        allocations,
      },
      client,
    });

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Supplier payment recorded and allocated successfully',
      data: payment,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Pay supplier payment error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to record supplier payment',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const getAllPayments = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          p.*,
          c.customer_name,
          s.supplier_name
       FROM payments p
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       ORDER BY p.id DESC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get payments error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
      error: error.message,
    });
  }
};



const getCustomerUnpaidInvoices = async (req, res) => {
  try {
    const { customerId } = req.params;

    const result = await pool.query(
      `SELECT
          id,
          invoice_no,
          invoice_date,
          total_amount,
          paid_amount,
          due_amount,
          status
       FROM sales_invoices
       WHERE customer_id = $1
         AND status != 'CANCELLED'
         AND due_amount > 0
       ORDER BY invoice_date ASC, id ASC`,
      [customerId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get customer unpaid invoices error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unpaid invoices',
      error: error.message,
    });
  }
};

const getSupplierUnpaidBills = async (req, res) => {
  try {
    const { supplierId } = req.params;

    const result = await pool.query(
      `SELECT
          id,
          bill_no,
          bill_date,
          total_amount,
          paid_amount,
          due_amount,
          status
       FROM purchase_bills
       WHERE supplier_id = $1
         AND status != 'CANCELLED'
         AND due_amount > 0
       ORDER BY bill_date ASC, id ASC`,
      [supplierId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get supplier unpaid bills error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unpaid purchase bills',
      error: error.message,
    });
  }
};

// Returns all payments that have been allocated against a specific invoice.
// Used on the invoice detail page to show payment history.
const getInvoicePaymentHistory = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const result = await pool.query(
      `SELECT
          ip.id,
          ip.allocated_amount,
          ip.created_at AS allocated_at,
          p.payment_date,
          p.payment_method,
          p.reference_no,
          p.remarks
       FROM invoice_payments ip
       JOIN payments p ON p.id = ip.payment_id
       WHERE ip.invoice_id = $1
       ORDER BY ip.id ASC`,
      [invoiceId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Get invoice payment history error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history',
      error: error.message,
    });
  }
};

module.exports = {
  receiveCustomerPayment,
  paySupplierPayment,
  getAllPayments,
  getCustomerUnpaidInvoices,
  getSupplierUnpaidBills,
  getInvoicePaymentHistory,
};