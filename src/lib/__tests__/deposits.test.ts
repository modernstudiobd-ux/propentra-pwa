import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import {
  collectDeposit, applyDepositToBill, refundDeposit, adjustDeposit,
  voidDepositTransaction, permanentlyDeleteVoidedDepositTransaction,
  getDepositBalance, DepositError,
} from '@/lib/deposits';
import { resetDb, seedSettings, seedBuildingFlatResident, seedBill } from '@/test/testUtils';

beforeEach(async () => {
  await resetDb();
  await seedSettings();
});

describe('deposit balance calculations', () => {
  it('starts at zero and accumulates collected deposits', async () => {
    const { resident } = await seedBuildingFlatResident();
    expect(await getDepositBalance(resident.id)).toBe(0);
    await collectDeposit(resident, 500);
    expect(await getDepositBalance(resident.id)).toBe(500);
    await collectDeposit(resident, 250);
    expect(await getDepositBalance(resident.id)).toBe(750);
  });

  it('rejects collecting a zero or negative amount', async () => {
    const { resident } = await seedBuildingFlatResident();
    await expect(collectDeposit(resident, 0)).rejects.toThrow(DepositError);
    await expect(collectDeposit(resident, -10)).rejects.toThrow(DepositError);
  });

  it('reduces balance when applying deposit to an invoice, and links the transaction to it', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    await collectDeposit(resident, 300);
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 200 });

    await applyDepositToBill(resident, bill!, 150);

    expect(await getDepositBalance(resident.id)).toBe(150);
    const freshBill = await db.bills.get(bill!.id!);
    expect(freshBill?.paidAmount).toBe(150);
    expect(freshBill?.status).toBe('partial');

    const applied = await db.depositTransactions.where('residentId').equals(resident.id).and((t) => t.type === 'applied').toArray();
    expect(applied).toHaveLength(1);
    expect(applied[0].invoiceId).toBe(bill!.id);
  });

  it('rejects applying more than the available deposit balance', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    await collectDeposit(resident, 100);
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 500 });
    await expect(applyDepositToBill(resident, bill!, 150)).rejects.toThrow(DepositError);
  });

  it('rejects applying more than the invoice remaining balance', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    await collectDeposit(resident, 1000);
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100 });
    await expect(applyDepositToBill(resident, bill!, 150)).rejects.toThrow(DepositError);
  });

  it('reduces balance on refund, and rejects refunding more than is held', async () => {
    const { resident } = await seedBuildingFlatResident();
    await collectDeposit(resident, 200);
    await refundDeposit(resident, 50);
    expect(await getDepositBalance(resident.id)).toBe(150);
    await expect(refundDeposit(resident, 1000)).rejects.toThrow(DepositError);
  });

  it('supports positive and negative manual adjustments, requires a note, and blocks going negative', async () => {
    const { resident } = await seedBuildingFlatResident();
    await collectDeposit(resident, 100);
    await adjustDeposit(resident, 50, 'correction for undercharge');
    expect(await getDepositBalance(resident.id)).toBe(150);
    await adjustDeposit(resident, -30, 'correction for overcharge');
    expect(await getDepositBalance(resident.id)).toBe(120);

    await expect(adjustDeposit(resident, 10, '')).rejects.toThrow(DepositError);
    await expect(adjustDeposit(resident, -1000, 'too much')).rejects.toThrow(DepositError);
  });
});

describe('voiding deposit transactions', () => {
  it('excludes voided transactions from the balance', async () => {
    const { resident } = await seedBuildingFlatResident();
    await collectDeposit(resident, 100);
    const txn = (await db.depositTransactions.where('residentId').equals(resident.id).toArray())[0];
    await voidDepositTransaction(txn, 'duplicate entry');
    expect(await getDepositBalance(resident.id)).toBe(0);
  });

  it('refuses to void an "applied" transaction directly (must void the payment instead)', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    await collectDeposit(resident, 300);
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 200 });
    await applyDepositToBill(resident, bill!, 100);
    const applied = (await db.depositTransactions.where('residentId').equals(resident.id).and((t) => t.type === 'applied').toArray())[0];

    await expect(voidDepositTransaction(applied, 'test')).rejects.toThrow(DepositError);
  });

  it('permanently deletes only once voided', async () => {
    const { resident } = await seedBuildingFlatResident();
    await collectDeposit(resident, 100);
    const txn = (await db.depositTransactions.where('residentId').equals(resident.id).toArray())[0];

    await expect(permanentlyDeleteVoidedDepositTransaction(txn)).rejects.toThrow(DepositError);

    await voidDepositTransaction(txn, 'mistake');
    const voided = (await db.depositTransactions.get(txn.id!))!;
    await permanentlyDeleteVoidedDepositTransaction(voided);
    expect(await db.depositTransactions.get(txn.id!)).toBeUndefined();
  });
});
