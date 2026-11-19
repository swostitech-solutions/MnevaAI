// S-13: a single, reusable spot for currency-aware formatting instead of
// each screen hard-coding ₹ + 'en-IN' directly. Every finance model in
// this app defaults to INR today (and most have no UI for the user to set
// anything else), so passing no currency keeps today's exact behavior —
// this exists so a screen that DOES have a real currency value (see
// fullSummary.js's upcomingBills/upcomingSubscriptions/etc., which now
// carry one through) can render it correctly instead of assuming India.
const CURRENCY_SYMBOL = {
  INR: '₹',
  USD: '$',
  GBP: '£',
  AED: 'AED ',
  SGD: 'S$',
  AUD: 'A$',
  CAD: 'C$',
};

const CURRENCY_LOCALE = {
  INR: 'en-IN',
  USD: 'en-US',
  GBP: 'en-GB',
  AED: 'en-AE',
  SGD: 'en-SG',
  AUD: 'en-AU',
  CAD: 'en-CA',
};

export function formatAmount(amount, currency = 'INR') {
  const code = (currency || 'INR').toUpperCase();
  const symbol = CURRENCY_SYMBOL[code] || `${code} `;
  const locale = CURRENCY_LOCALE[code] || 'en-IN';
  return `${symbol}${(amount || 0).toLocaleString(locale)}`;
}
