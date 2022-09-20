import {Currency as ICurrency} from 'coinbase-pro-node';
import {abs, log10} from 'mathjs';
import {USE_SANDBOX} from '.';
import {Currency, CurrencyModel} from './models';
import {getHash} from './utils';

let initialized: boolean = false;
const CURRENCIES = new Map<string, Currency>();

export class Currencies {
  constructor() {}

  /**
   * Add the currency to the local memory and database.
   *
   * @param {Currency | Currency[]} currencies - Currency to update.
   * @returns {Promise<Currency[]} Changed currencies compared to locally stored.
   */
  static async update(
    currencies: ICurrency | ICurrency[],
  ): Promise<Currency[]> {
    if (!Array.isArray(currencies)) currencies = [currencies];

    const updated: Currency[] = [];
    for (const c of currencies) {
      // Change it locally.
      const currency = Currencies.convert(c, USE_SANDBOX);

      const oldHash = getHash(Currencies.get(c.id) ?? {});
      if (oldHash === getHash(currency)) continue;

      updated.push(currency);
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

    return updated;
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
   * Obtains all of the currently held currencies.
   *
   * @returns {Currency[]} List of all currencies.
   */
  static getAll(): Currency[] {
    return [...CURRENCIES.values()];
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

  /**
   * Strips any other potentially held data from the currency.
   *
   * @param {Currency} currency - Currency to remove data from.
   * @returns {Currency} Freshly cleaned currency.
   */
  static clean(currency: Currency): Currency {
    return <Currency>{
      id: currency.id,
      name: currency.name,
      useSandbox: currency.useSandbox,
      min_size: currency.min_size,
      max_precision: currency.max_precision,
      status: currency.status,
    };
  }

  /**
   * Converts an API version of a currency to a locally stored type.
   *
   * @param {ICurreny} apiCurrency - API version of the currency.
   * @param {boolean} sandbox - Production or Sandbox version.
   * @returns {Currency} Converted currency.
   */
  static convert(apiCurrency: ICurrency, sandbox: boolean): Currency {
    return <Currency>{
      id: apiCurrency.id,
      name: apiCurrency.name,
      useSandbox: sandbox,
      min_size: apiCurrency.min_size,
      max_precision: apiCurrency.max_precision,
      status: apiCurrency.status,
    };
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

  // Clean and store the data locally.
  for (const c of currencies) {
    CURRENCIES.set(c.id, Currencies.clean(c));
  }
}
