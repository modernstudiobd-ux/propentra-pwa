import { money, dateLabel } from '@/lib/format';
import type { Bill, Receipt, Resident, Building, Flat } from '@/types';

function digitsOnly(mobile: string) {
  return mobile.replace(/\D/g, '');
}

// Assumes Bangladesh numbers (matches the app's ৳ currency/locale): a
// leading 0 is replaced with the 880 country code for wa.me links.
function intlDigits(mobile: string) {
  const d = digitsOnly(mobile);
  if (d.startsWith('880')) return d;
  if (d.startsWith('0')) return '880' + d.slice(1);
  return d;
}

export function buildInvoiceMessage(bill: Bill, resident: Resident, building?: Building, flat?: Flat, companyName?: string) {
  return [
    `Dear ${resident.name},`,
    ``,
    `Your invoice for ${bill.billingMonth} (Flat ${flat?.unitNo ?? ''}, ${building?.name ?? ''}) is ready.`,
    ``,
    `Invoice #: ${bill.invoiceNo}`,
    `Total Amount Due: ${money(bill.totalAmount)}`,
    `Due Date: ${dateLabel(bill.dueDate)}`,
    ``,
    `Please make payment by the due date. Thank you.`,
    `- ${companyName || building?.name || ''}`,
  ].join('\n');
}

export function buildReceiptMessage(receipt: Receipt, resident: Resident, building?: Building, flat?: Flat, companyName?: string) {
  return [
    `Dear ${resident.name},`,
    ``,
    `We have received your payment for Flat ${flat?.unitNo ?? ''}, ${building?.name ?? ''}.`,
    ``,
    `Receipt #: ${receipt.receiptNo}`,
    `Amount Received: ${money(receipt.amountReceived)}`,
    `Remaining Balance: ${money(receipt.remainingBalance)}`,
    ``,
    `Thank you for your payment.`,
    `- ${companyName || building?.name || ''}`,
  ].join('\n');
}

export function whatsappLink(mobile: string, message: string) {
  return `https://wa.me/${intlDigits(mobile)}?text=${encodeURIComponent(message)}`;
}

export function smsLink(mobile: string, message: string) {
  return `sms:${digitsOnly(mobile)}?&body=${encodeURIComponent(message)}`;
}
