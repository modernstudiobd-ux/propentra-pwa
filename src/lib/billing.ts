import { db } from '@/lib/db';
import type { Bill, Payment } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }

export async function genInvoiceNo() {
  const count = await db.bills.count();
  return `INV-2026-${String(76 + count).padStart(3, '0')}`;
}

export async function genReceiptNo() {
  const count = await db.receipts.count();
  return `RCPT-2026-${String(43 + count).padStart(4, '0')}`;
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

  return db.transaction('rw', [db.bills, db.receipts, db.payments], async () => {
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

    await db.payments.add({
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

    const receipt = await db.receipts.get(receiptId as number);
    return { newPaid, status, receipt: receipt! };
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

  await db.transaction('rw', [db.bills, db.receipts, db.payments], async () => {
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
  });
}
