import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import {
  genInvoiceNo, genReceiptNo, recordPaymentForBill, validatePaymentAmount,
  PaymentValidationError, voidPayment, permanentlyDeleteVoidedPayment,
  voidBill, permanentlyDeleteVoidedBill, BillVoidError, isDuplicatePayment,
} from '@/lib/billing';
import { resetDb, seedSettings, seedBuildingFlatResident, seedBill } from '@/test/testUtils';

beforeEach(async () => {
  await resetDb();
  await seedSettings();
});

describe('invoice / receipt numbering', () => {
  it('generates sequential, monotonically increasing invoice numbers', async () => {
    const a = await genInvoiceNo();
    const b = await genInvoiceNo();
    const c = await genInvoiceNo();
    expect(a).toBe('INV-2026-076');
    expect(b).toBe('INV-2026-077');
    expect(c).toBe('INV-2026-078');
  });

  it('never reuses a number, even after the bill using it is deleted', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const invoiceNo = await genInvoiceNo();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100, invoiceNo });
    await voidBill(bill!, 'test cleanup');
    await permanentlyDeleteVoidedBill((await db.bills.get(bill!.id!))!);

    const next = await genInvoiceNo();
    // Must NOT collide with the deleted invoice's number - the counter is
    // persistent and never derived from what currently exists in the table.
    expect(next).not.toBe(invoiceNo);
  });

  it('generates sequential receipt numbers independently of invoice numbers', async () => {
    const a = await genReceiptNo();
    const b = await genReceiptNo();
    expect(a).toBe('RCPT-2026-0043');
    expect(b).toBe('RCPT-2026-0044');
  });
});

describe('payment amount validation', () => {
  it('rejects zero, negative, NaN and non-finite amounts', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100 });
    expect(() => validatePaymentAmount(bill!, 0)).toThrow(PaymentValidationError);
    expect(() => validatePaymentAmount(bill!, -5)).toThrow(PaymentValidationError);
    expect(() => validatePaymentAmount(bill!, NaN)).toThrow(PaymentValidationError);
    expect(() => validatePaymentAmount(bill!, Infinity)).toThrow(PaymentValidationError);
  });

  it('rejects amounts that exceed the remaining balance (no overpayment)', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100 });
    expect(() => validatePaymentAmount(bill!, 100.01)).toThrow(PaymentValidationError);
  });

  it('allows paying the exact remaining balance despite floating-point noise', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 33.33 });
    expect(() => validatePaymentAmount(bill!, 33.33)).not.toThrow();
  });
});

describe('recordPaymentForBill', () => {
  it('applies a partial payment: updates paidAmount, status, and creates receipt + payment records', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 200 });

    const { newPaid, status, receipt } = await recordPaymentForBill(bill!, 80, 'Cash');

    expect(newPaid).toBe(80);
    expect(status).toBe('partial');
    expect(receipt.amountReceived).toBe(80);
    expect(receipt.remainingBalance).toBe(120);

    const freshBill = await db.bills.get(bill!.id!);
    expect(freshBill?.paidAmount).toBe(80);
    expect(freshBill?.status).toBe('partial');

    const payments = await db.payments.where('invoiceId').equals(bill!.id!).toArray();
    expect(payments).toHaveLength(1);
    expect(payments[0].type).toBe('Partial');
  });

  it('marks the bill fully paid once paidAmount reaches totalAmount', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 150 });

    const { status } = await recordPaymentForBill(bill!, 150, 'Bank Transfer');
    expect(status).toBe('paid');

    const freshBill = await db.bills.get(bill!.id!);
    expect(freshBill?.status).toBe('paid');
  });

  it('supports multiple partial payments accumulating correctly', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100 });

    await recordPaymentForBill(bill!, 40, 'Cash');
    const second = await recordPaymentForBill((await db.bills.get(bill!.id!))!, 60, 'Cash');

    expect(second.newPaid).toBe(100);
    expect(second.status).toBe('paid');
  });

  it('writes an audit log entry for every payment recorded', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100 });
    await recordPaymentForBill(bill!, 100, 'Cash');

    const entries = await db.auditLog.where('action').equals('payment_recorded').toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(100);
  });

  it('detects a same-day duplicate payment (same invoice, amount, method)', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100 });
    await recordPaymentForBill(bill!, 50, 'Cash');

    const dup = await isDuplicatePayment((await db.bills.get(bill!.id!))!, 50, 'Cash');
    expect(dup).toBe(true);

    const notDup = await isDuplicatePayment((await db.bills.get(bill!.id!))!, 50, 'Bank Transfer');
    expect(notDup).toBe(false);
  });
});

describe('voidPayment / permanentlyDeleteVoidedPayment', () => {
  it('reverses the bill balance and marks payment + receipt voided', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100 });
    await recordPaymentForBill(bill!, 100, 'Cash');

    const payment = (await db.payments.where('invoiceId').equals(bill!.id!).toArray())[0];
    await voidPayment(payment, 'entered by mistake');

    const freshBill = await db.bills.get(bill!.id!);
    expect(freshBill?.paidAmount).toBe(0);
    expect(freshBill?.status).toBe('unpaid');

    const freshPayment = await db.payments.get(payment.id!);
    expect(freshPayment?.voided).toBe(true);
    expect(freshPayment?.voidReason).toBe('entered by mistake');
  });

  it('blocks permanent delete of a payment that has not been voided', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100 });
    await recordPaymentForBill(bill!, 100, 'Cash');
    const payment = (await db.payments.where('invoiceId').equals(bill!.id!).toArray())[0];

    await expect(permanentlyDeleteVoidedPayment(payment)).rejects.toThrow();
  });

  it('permanently deletes a payment once voided, leaving no trace in the payments table', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100 });
    await recordPaymentForBill(bill!, 100, 'Cash');
    const payment = (await db.payments.where('invoiceId').equals(bill!.id!).toArray())[0];
    await voidPayment(payment, 'duplicate entry');

    const freshVoided = (await db.payments.get(payment.id!))!;
    await permanentlyDeleteVoidedPayment(freshVoided);
    expect(await db.payments.get(payment.id!)).toBeUndefined();
  });
});

describe('voidBill / permanentlyDeleteVoidedBill', () => {
  it('blocks voiding a bill that still has active payments', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100 });
    await recordPaymentForBill(bill!, 50, 'Cash');

    await expect(voidBill((await db.bills.get(bill!.id!))!, 'test')).rejects.toThrow(BillVoidError);
  });

  it('allows voiding once all payments are voided, and requires a reason', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100 });
    await recordPaymentForBill(bill!, 100, 'Cash');
    const payment = (await db.payments.where('invoiceId').equals(bill!.id!).toArray())[0];
    await voidPayment(payment, 'mistake');

    await expect(voidBill((await db.bills.get(bill!.id!))!, '')).rejects.toThrow(BillVoidError);
    await voidBill((await db.bills.get(bill!.id!))!, 'resident moved out before invoicing');

    const freshBill = await db.bills.get(bill!.id!);
    expect(freshBill?.voided).toBe(true);
  });
});

describe('transaction rollback', () => {
  it('leaves no receipt/payment/audit record behind when a concurrent change makes the payment invalid mid-transaction', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100 });

    // Simulate another tab/session recording a payment right after this
    // caller read the bill but before recordPaymentForBill runs - the
    // remaining balance is now smaller than the amount being submitted.
    await db.bills.update(bill!.id!, { paidAmount: 80, status: 'partial' });

    await expect(recordPaymentForBill(bill!, 50, 'Cash')).rejects.toThrow(PaymentValidationError);

    // Nothing partial should have been written: no new receipt, no new
    // payment, no audit entry, and the bill keeps the value set above -
    // recordPaymentForBill's own (failed) update never applied.
    const receipts = await db.receipts.where('invoiceId').equals(bill!.id!).toArray();
    const payments = await db.payments.where('invoiceId').equals(bill!.id!).toArray();
    const auditEntries = await db.auditLog.where('action').equals('payment_recorded').toArray();
    expect(receipts).toHaveLength(0);
    expect(payments).toHaveLength(0);
    expect(auditEntries).toHaveLength(0);

    const freshBill = await db.bills.get(bill!.id!);
    expect(freshBill?.paidAmount).toBe(80);
  });
});
