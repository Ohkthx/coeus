import {Currency as ICurrency} from 'coinbase-pro-node';
import {abs, log10} from 'mathjs';
import {USE_SANDBOX} from '.';
import {Currency, CurrencyModel} from './models';

let initialized: boolean = false;
const CURRENCIES = new Map<string, Currency>();

export class Currencies {
  constructor() {}

  /**
   * Add the currency to the local memory and database.
   *
   * @param {Currency | Currency[]} currencies - Currency to update.
   */
  static async update(currencies: ICurrency | ICurrency[]) {
    if (!Array.isArray(currencies)) currencies = [currencies];

    for (const c of currencies) {
      // Change it locally.
      const currency = <Currency>c;
      currency.useSandbox = USE_SANDBOX;
      CURRENCIES.set(c.id, currency);

      // Update the database.
      await CurrencyModel.updateOne(
        {id: c.id, useSandbox: USE_SANDBOX},
        currency,
        {
          upsert: true,
        },
      );
    }
  }

  /**
   * Get a specific currency.
   *
   * @param {string} currencyId - Currency to try and resolve.
   * @returns {Currency | undefined} Currency if found, otherwise undefined.
   */
  static get(currencyId: string): Currency | undefined {
    return CURRENCIES.get(currencyId);
  }

  /**
   * Get the precision for the currency (how many decimal places to round to.
   *
   * @param {string} currencyId - Currency to pull information for.
   * @returns {number} Precision for the currency.
   */
  static getPrecision(currencyId: string): number {
    const currency = CURRENCIES.get(currencyId);
    if (!currency) {
      throw new Error(`invalid currency id, cannot get precision.`);
    }
    const precision = parseFloat(currency.max_precision);

    return abs(log10(precision));
  }
}

/**
 * Trims a number to the desired amount of decimal places.
 *
 * @param {string} currencyId - Currency to use for rounding.
 * @param {number} value - Number to adjust.
 * @returns {number} Newly formatted number.
 */
export function toFixed(currencyId: string, value: number): number {
  let dec: number = 8;
  try {
    dec = Currencies.getPrecision(currencyId);
  } catch (_err) {}

  return parseFloat(value.toFixed(dec));
}

/**
 * Get the minimum sizes of the currency.
 *
 * @param {string} currencyId - Currency to pull information for.
 * @returns {number} Minimum size.
 */
export function minimumSize(currencyId: string): number {
  const currency = CURRENCIES.get(currencyId);
  if (!currency) {
    throw new Error(`invalid currency id, cannot get minimum size.`);
  }

  return parseFloat(currency.min_size);
}

/**
 * Initialize currency by loading it from the database.
 */
export async function initCurrency() {
  if (initialized) return;

  // Pull the information from the db and assign.
  const currencies = await CurrencyModel.find({useSandbox: USE_SANDBOX}, null, {
    lean: true,
  });
  for (const c of currencies) {
    CURRENCIES.set(c.id, c);
  }
}
