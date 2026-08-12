import { db } from '@/lib/db';
import type { Resident, Bill, DepositTransaction } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }

export class DepositError extends Error {}

/** Current deposit balance held for a resident, derived from the full transaction history. */
export async function getDepositBalance(residentId: number): Promise<number> {
  const txns = await db.depositTransactions.where('residentId').equals(residentId).toArray();
  return txns.reduce((sum, t) => {
    if (t.voided) return sum;
    if (t.type === 'collected') return sum + t.amount;
    if (t.type === 'applied') return sum - t.amount;
    if (t.type === 'refunded') return sum - t.amount;
    if (t.type === 'adjustment') return sum + t.amount; // amount may be negative for a downward adjustment
    return sum;
  }, 0);
}

function validateAmount(amount: number) {
  if (typeof amount !== 'number' || Number.isNaN(amount) || !Number.isFinite(amount) || amount <= 0) {
    throw new DepositError('Enter a valid amount greater than zero.');
  }
}

export async function collectDeposit(resident: Resident, amount: number, notes?: string) {
  validateAmount(amount);
  await db.depositTransactions.add({
    residentId: resident.id!, buildingId: resident.buildingId, flatId: resident.flatId,
    type: 'collected', amount, date: todayISO(), notes, voided: false,
  });
}

/**
 * Applies deposit balance toward an outstanding invoice - functions like a
 * payment (reduces the bill's due amount, creates a Receipt/Payment record
 * labeled "Security Deposit Applied") while also debiting the deposit ledger,
 * all in one atomic transaction.
 */
export async function applyDepositToBill(resident: Resident, bill: Bill, amount: number) {
  validateAmount(amount);
  if (!bill.id || !resident.id) throw new DepositError('Missing bill or resident.');

  const balance = await getDepositBalance(resident.id);
  if (Math.round((amount - balance) * 100) / 100 > 0) {
    throw new DepositError(`Amount exceeds the available deposit balance (${balance.toFixed(2)}).`);
  }
  const due = bill.totalAmount - bill.paidAmount;
  if (Math.round((amount - due) * 100) / 100 > 0) {
    throw new DepositError(`Amount exceeds the invoice's remaining balance (${due.toFixed(2)}).`);
  }

  return db.transaction('rw', [db.bills, db.receipts, db.payments, db.depositTransactions], async () => {
    const freshBill = await db.bills.get(bill.id!);
    if (!freshBill) throw new DepositError('Invoice no longer exists.');

    const newPaid = freshBill.paidAmount + amount;
    const status = newPaid >= freshBill.totalAmount ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
    await db.bills.update(freshBill.id!, { paidAmount: newPaid, status });

    const receiptCount = await db.receipts.count();
    const receiptId = await db.receipts.add({
      receiptNo: `RCPT-2026-${String(43 + receiptCount).padStart(4, '0')}`,
      invoiceId: freshBill.id!,
      residentId: freshBill.residentId,
      buildingId: freshBill.buildingId,
      flatId: freshBill.flatId,
      date: todayISO(),
      amountReceived: amount,
      previousBalance: freshBill.previousBalance,
      totalPayable: freshBill.totalAmount,
      remainingBalance: freshBill.totalAmount - newPaid,
      method: 'Security Deposit Applied',
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
      method: 'Security Deposit Applied',
      amount,
      type: status === 'paid' ? 'Full' : 'Partial',
      voided: false,
    });

    await db.depositTransactions.add({
      residentId: resident.id!, buildingId: resident.buildingId, flatId: resident.flatId,
      type: 'applied', amount, date: todayISO(), invoiceId: freshBill.id!,
      notes: `Applied to invoice ${freshBill.invoiceNo}`, voided: false,
    });

    return { newPaid, status };
  });
}

export async function refundDeposit(resident: Resident, amount: number, notes?: string) {
  validateAmount(amount);
  const balance = await getDepositBalance(resident.id!);
  if (Math.round((amount - balance) * 100) / 100 > 0) {
    throw new DepositError(`Amount exceeds the available deposit balance (${balance.toFixed(2)}).`);
  }
  await db.depositTransactions.add({
    residentId: resident.id!, buildingId: resident.buildingId, flatId: resident.flatId,
    type: 'refunded', amount, date: todayISO(), notes, voided: false,
  });
}

/** Manual correction - amount can be positive (add) or negative (deduct). */
export async function adjustDeposit(resident: Resident, amount: number, notes: string) {
  if (typeof amount !== 'number' || Number.isNaN(amount) || !Number.isFinite(amount) || amount === 0) {
    throw new DepositError('Enter a non-zero adjustment amount.');
  }
  if (!notes.trim()) throw new DepositError('A note explaining the adjustment is required.');
  await db.depositTransactions.add({
    residentId: resident.id!, buildingId: resident.buildingId, flatId: resident.flatId,
    type: 'adjustment', amount, date: todayISO(), notes, voided: false,
  });
}

/**
 * Voids a deposit transaction. 'applied' transactions can't be voided here
 * since reversing one would also need to reverse the linked invoice payment -
 * void the payment itself from the Payments page instead, which keeps both
 * ledgers consistent.
 */
export async function voidDepositTransaction(txn: DepositTransaction, reason: string) {
  if (!txn.id) return;
  if (txn.type === 'applied') {
    throw new DepositError('This deposit was applied to an invoice - void the payment from the Payments page instead, which reverses both records consistently.');
  }
  await db.depositTransactions.update(txn.id, { voided: true, voidedAt: new Date().toISOString() });
}
