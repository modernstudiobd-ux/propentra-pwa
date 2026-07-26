import { db } from '@/lib/db';
import type { Bill } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }

export async function genInvoiceNo() {
  const count = await db.bills.count();
  return `INV-2026-${String(76 + count).padStart(3, '0')}`;
}

export async function genReceiptNo() {
  const count = await db.receipts.count();
  return `RCPT-2026-${String(43 + count).padStart(4, '0')}`;
}

/**
 * Records a payment against an existing bill: updates the bill's paid amount
 * and status, and creates matching Receipt + Payment records. Shared by
 * Bill Generator and Receipt Generator so the logic lives in one place.
 */
export async function recordPaymentForBill(
  bill: Bill,
  amountReceived: number,
  method: 'Cash' | 'bKash' | 'Nagad' | 'Bank'
) {
  if (!bill.id) throw new Error('Bill has no id');
  const newPaid = bill.paidAmount + amountReceived;
  const status = newPaid >= bill.totalAmount ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

  await db.bills.update(bill.id, { paidAmount: newPaid, status });

  const receiptNo = await genReceiptNo();
  const receiptId = await db.receipts.add({
    receiptNo,
    invoiceId: bill.id,
    residentId: bill.residentId,
    buildingId: bill.buildingId,
    flatId: bill.flatId,
    date: todayISO(),
    amountReceived,
    previousBalance: bill.previousBalance,
    totalPayable: bill.totalAmount,
    remainingBalance: bill.totalAmount - newPaid,
    method,
    receivedBy: 'Manager',
  });

  await db.payments.add({
    date: todayISO(),
    invoiceId: bill.id,
    residentId: bill.residentId,
    buildingId: bill.buildingId,
    flatId: bill.flatId,
    method,
    amount: amountReceived,
    type: newPaid >= bill.totalAmount ? 'Full' : 'Partial',
  });

  const receipt = await db.receipts.get(receiptId as number);
  return { newPaid, status, receipt: receipt! };
}
