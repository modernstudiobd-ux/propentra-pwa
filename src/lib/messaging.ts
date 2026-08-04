import { money, dateLabel } from '@/lib/format';
import { currencyState } from '@/lib/currency';
import type { Bill, Receipt, Resident, Building, Flat } from '@/types';

function digitsOnly(mobile: string) {
  return mobile.replace(/\D/g, '');
}

// Uses the country dialing code configured in Settings (e.g. '880', '1', '44')
// to turn a local number like "01711-223344" into the full international
// format WhatsApp's wa.me links require. If no country code is configured,
// the number is passed through as-is (works if residents already enter
// numbers in full international format).
function intlDigits(mobile: string) {
  const d = digitsOnly(mobile);
  const cc = digitsOnly(currencyState.countryCode);
  if (!cc) return d;
  if (d.startsWith(cc)) return d;
  if (d.startsWith('0')) return cc + d.slice(1);
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
