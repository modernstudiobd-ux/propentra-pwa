import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import type { Bill, Payment, CompanySettings } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }

/**
 * Atomically reads-increments-writes a persistent sequence counter in
 * Settings. This replaces the old `.count()`-based numbering, which was
 * unsafe: voiding or deleting any bill/receipt shifts the count, so the
 * next generated number could collide with one that already exists.
 * A monotonic counter that's never decremented and never reused fixes this.
 *
 * On first use (counter not yet set - e.g. an existing install upgrading to
 * this fix), it bootstraps from the highest sequence number actually found
 * in existing records, so it can never collide with numbers already handed
 * out under the old scheme.
 */
async function nextSeq(field: 'nextInvoiceSeq' | 'nextReceiptSeq', bootstrapFrom: () => Promise<number>): Promise<number> {
  return db.transaction('rw', db.settings, db.bills, db.receipts, async () => {
    const settings = await db.settings.toCollection().first();
    if (!settings?.id) throw new Error('Settings not initialized yet - reload the app and try again.');
    let seq = settings[field];
    if (seq === undefined) seq = await bootstrapFrom();
    const update: Partial<CompanySettings> =
      field === 'nextInvoiceSeq' ? { nextInvoiceSeq: seq + 1 } : { nextReceiptSeq: seq + 1 };
    await db.settings.update(settings.id, update);
    return seq;
  });
}

export async function genInvoiceNo() {
  const seq = await nextSeq('nextInvoiceSeq', async () => {
    const existing = await db.bills.toArray();
    const maxSeq = existing.reduce((max, b) => {
      const m = /INV-\d{4}-(\d+)/.exec(b.invoiceNo);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 75);
    return maxSeq + 1;
  });
  return `INV-${new Date().getFullYear()}-${String(seq).padStart(3, '0')}`;
}

export async function genReceiptNo() {
  const seq = await nextSeq('nextReceiptSeq', async () => {
    const existing = await db.receipts.toArray();
    const maxSeq = existing.reduce((max, r) => {
      const m = /RCPT-\d{4}-(\d+)/.exec(r.receiptNo);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 42);
    return maxSeq + 1;
  });
  return `RCPT-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
}

function statusFor(bill: Bill, paidAmount: number): Bill['status'] {
  if (paidAmount >= bill.totalAmount) return 'paid';
  if (paidAmount > 0) return 'partial';
  return 'unpaid';
}

export class PaymentValidationError extends Error {}

/** Throws PaymentValidationError with a user-facing message if the amount is invalid. */
export function validatePaymentAmount(bill: Bill, amount: number) {
  if (typeof amount !== 'number' || Number.isNaN(amount) || !Number.isFinite(amount)) {
    throw new PaymentValidationError('Enter a valid amount.');
  }
  if (amount <= 0) {
    throw new PaymentValidationError('Amount must be greater than zero.');
  }
  const due = bill.totalAmount - bill.paidAmount;
  // Round to avoid floating-point cents rejecting an exact "pay in full" click.
  if (Math.round((amount - due) * 100) / 100 > 0) {
    throw new PaymentValidationError(`Amount exceeds the remaining balance due (${due.toFixed(2)}). Overpayments aren't allowed - record the difference as a deposit/credit instead if the resident intentionally paid extra.`);
  }
}

/**
 * True if an identical, non-voided payment (same invoice, same amount, same
 * day) already exists. Not a hard block - the caller decides whether to
 * confirm with the person before proceeding, since legitimate same-day
 * repeat payments do happen.
 */
export async function isDuplicatePayment(bill: Bill, amount: number, method: string): Promise<boolean> {
  if (!bill.id) return false;
  const today = todayISO();
  const existing = await db.payments.where('invoiceId').equals(bill.id).toArray();
  return existing.some((p) => !p.voided && p.date === today && p.amount === amount && p.method === method);
}

/**
 * Records a payment against an existing bill: updates the bill's paid amount
 * and status, and creates matching Receipt + Payment records, all inside one
 * atomic transaction (either everything commits, or nothing does - a crash
 * or error partway through can never leave the bill and its receipt/payment
 * records out of sync). Shared by Bill Generator, Receipt Generator, and
 * Payments so the logic lives in one place.
 *
 * Throws PaymentValidationError for invalid/NaN/negative/overpaying amounts.
 */
export async function recordPaymentForBill(
  bill: Bill,
  amountReceived: number,
  method: string
) {
  if (!bill.id) throw new Error('Bill has no id');
  validatePaymentAmount(bill, amountReceived);

  return db.transaction('rw', [db.bills, db.receipts, db.payments, db.settings, db.auditLog], async () => {
    // Re-read the bill inside the transaction in case it changed since the
    // caller loaded it (e.g. another payment was just recorded) - avoids a
    // stale-read race that could double-apply or miscalculate the balance.
    const freshBill = await db.bills.get(bill.id!);
    if (!freshBill) throw new Error('Invoice no longer exists.');
    validatePaymentAmount(freshBill, amountReceived);

    const newPaid = freshBill.paidAmount + amountReceived;
    const status = statusFor(freshBill, newPaid);

    await db.bills.update(freshBill.id!, { paidAmount: newPaid, status });

    const receiptNo = await genReceiptNo();
    const receiptId = await db.receipts.add({
      receiptNo,
      invoiceId: freshBill.id!,
      residentId: freshBill.residentId,
      buildingId: freshBill.buildingId,
      flatId: freshBill.flatId,
      date: todayISO(),
      amountReceived,
      previousBalance: freshBill.previousBalance,
      totalPayable: freshBill.totalAmount,
      remainingBalance: freshBill.totalAmount - newPaid,
      method,
      receivedBy: 'Manager',
      voided: false,
    });

    const paymentId = await db.payments.add({
      date: todayISO(),
      invoiceId: freshBill.id!,
      receiptId: receiptId as number,
      residentId: freshBill.residentId,
      buildingId: freshBill.buildingId,
      flatId: freshBill.flatId,
      method,
      amount: amountReceived,
      type: status === 'paid' ? 'Full' : 'Partial',
      voided: false,
    });

    await logAudit({
      action: 'payment_recorded', entityType: 'payment', entityId: paymentId as number,
      buildingId: freshBill.buildingId, flatId: freshBill.flatId, residentId: freshBill.residentId,
      amount: amountReceived,
      summary: `Payment of ${amountReceived.toFixed(2)} recorded against invoice ${freshBill.invoiceNo} (${method})`,
    });

    const receipt = await db.receipts.get(receiptId as number);
    return { newPaid, status, receipt: receipt! };
  });
}

/**
 * Permanently deletes a payment - but ONLY if it's already voided. A voided
 * payment has zero effect on any balance (that's what voiding did), so
 * removing the record itself is just cleanup, not a loss of financial
 * truth. This is the standard two-tier pattern (see e.g. QuickBooks/Xero):
 * void protects anything "live"; hard delete is only ever available for
 * something that's already been fully reversed.
 */
export async function permanentlyDeleteVoidedPayment(payment: Payment) {
  if (!payment.id) return;
  if (!payment.voided) {
    throw new Error('Only voided payments can be permanently deleted. Void it first.');
  }
  await db.transaction('rw', [db.payments, db.receipts, db.auditLog], async () => {
    await db.payments.delete(payment.id!);
    if (payment.receiptId) {
      const receipt = await db.receipts.get(payment.receiptId);
      if (receipt?.voided) await db.receipts.delete(payment.receiptId);
    }
    await logAudit({
      action: 'payment_deleted', entityType: 'payment', entityId: payment.id,
      buildingId: payment.buildingId, flatId: payment.flatId, residentId: payment.residentId,
      amount: payment.amount,
      summary: `Permanently deleted voided payment of ${payment.amount.toFixed(2)}`,
    });
  });
}

/**
 * Voids a payment instead of deleting it - the record stays forever for
 * audit purposes, just marked voided, with the bill's balance reversed
 * atomically. This replaces the old hard-delete "remove payment" behavior.
 */
export async function voidPayment(payment: Payment, reason: string) {
  if (!payment.id) return;
  if (payment.voided) return; // already voided, nothing to do

  await db.transaction('rw', [db.bills, db.receipts, db.payments, db.auditLog], async () => {
    const bill = await db.bills.get(payment.invoiceId);
    if (bill && bill.id) {
      const newPaid = Math.max(0, bill.paidAmount - payment.amount);
      await db.bills.update(bill.id, { paidAmount: newPaid, status: statusFor(bill, newPaid) });
    }

    await db.payments.update(payment.id!, {
      voided: true, voidedAt: new Date().toISOString(), voidReason: reason,
    });

    if (payment.receiptId) {
      await db.receipts.update(payment.receiptId, {
        voided: true, voidedAt: new Date().toISOString(), voidReason: reason,
      });
    }

    await logAudit({
      action: 'payment_voided', entityType: 'payment', entityId: payment.id,
      buildingId: payment.buildingId, flatId: payment.flatId, residentId: payment.residentId,
      amount: payment.amount,
      summary: `Voided payment of ${payment.amount.toFixed(2)}`,
      details: `Reason: ${reason}`,
    });
  });
}

export class BillVoidError extends Error {}

/**
 * Voids an invoice instead of deleting it. Blocked if the invoice has any
 * active (non-voided) payments against it - those must be voided first via
 * the Payments page, so the payment-side balance reversal and the
 * invoice-side void can never get out of sync. This replaces the old
 * hard-delete, which silently orphaned any linked receipts/payments.
 */
export async function voidBill(bill: Bill, reason: string) {
  if (!bill.id) return;
  if (bill.voided) return;
  if (!reason.trim()) throw new BillVoidError('A reason is required to void an invoice.');

  const activePayments = await db.payments.where('invoiceId').equals(bill.id).toArray();
  if (activePayments.some((p) => !p.voided)) {
    throw new BillVoidError('This invoice has active payments against it. Void those payments first (from the Payments page), then void the invoice.');
  }

  await db.transaction('rw', [db.bills, db.auditLog], async () => {
    await db.bills.update(bill.id!, { voided: true, voidedAt: new Date().toISOString(), voidReason: reason.trim() });
    await logAudit({
      action: 'bill_voided', entityType: 'bill', entityId: bill.id,
      buildingId: bill.buildingId, flatId: bill.flatId, residentId: bill.residentId,
      amount: bill.totalAmount,
      summary: `Voided invoice ${bill.invoiceNo} (${bill.totalAmount.toFixed(2)})`,
      details: `Reason: ${reason.trim()}`,
    });
  });
}

/**
 * Permanently deletes an invoice - but ONLY if it's already voided (which
 * itself required all its payments to already be voided). Same two-tier
 * pattern as payments/deposits: nothing with live financial effect can be
 * hard-deleted, only something already fully reversed.
 */
export async function permanentlyDeleteVoidedBill(bill: Bill) {
  if (!bill.id) return;
  if (!bill.voided) throw new BillVoidError('Only voided invoices can be permanently deleted. Void it first.');
  const stillLinked = await db.payments.where('invoiceId').equals(bill.id).toArray();
  if (stillLinked.some((p) => !p.voided)) {
    throw new BillVoidError('This invoice still has active payments linked to it and cannot be deleted.');
  }
  await db.transaction('rw', [db.bills, db.auditLog], async () => {
    await db.bills.delete(bill.id!);
    await logAudit({
      action: 'bill_deleted', entityType: 'bill', entityId: bill.id,
      buildingId: bill.buildingId, flatId: bill.flatId, residentId: bill.residentId,
      amount: bill.totalAmount,
      summary: `Permanently deleted voided invoice ${bill.invoiceNo}`,
    });
  });
}
