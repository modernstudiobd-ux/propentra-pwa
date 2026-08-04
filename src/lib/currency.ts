import { liveQuery } from 'dexie';
import { db } from '@/lib/db';

export const currencyState = {
  symbol: '৳',
  name: 'Taka',
  countryCode: '880',
};

let started = false;

/** Call once at app startup to keep currencyState in sync with Settings. */
export function watchCurrencySettings() {
  if (started) return;
  started = true;
  liveQuery(() => db.settings.toCollection().first()).subscribe((settings) => {
    if (!settings) return;
    currencyState.symbol = settings.currencySymbol || '৳';
    currencyState.name = settings.currencyName || 'Taka';
    currencyState.countryCode = settings.countryCode || '880';
  });
}
