export function money(n: number): string {
  return `৳ ${n.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Compact form for tight spaces (e.g. inside a donut chart's center) where a
// full "৳ 27,590.00" string would overflow — e.g. "৳27.6K" instead.
export function moneyCompact(n: number): string {
  return `৳${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`;
}

export function dateLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function numberToWords(n: number): string {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(num: number): string {
    if (num === 0) return '';
    if (num < 20) return a[num] + ' ';
    if (num < 100) return b[Math.floor(num / 10)] + ' ' + inWords(num % 10);
    if (num < 1000) return a[Math.floor(num / 100)] + ' Hundred ' + inWords(num % 100);
    if (num < 100000) return inWords(Math.floor(num / 1000)) + 'Thousand ' + inWords(num % 1000);
    if (num < 10000000) return inWords(Math.floor(num / 100000)) + 'Lakh ' + inWords(num % 100000);
    return inWords(Math.floor(num / 10000000)) + 'Crore ' + inWords(num % 10000000);
  }

  const whole = Math.floor(n);
  const words = inWords(whole).trim();
  return (words || 'Zero') + ' Taka Only';
}
