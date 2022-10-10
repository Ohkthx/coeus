import {Currency as ICurrency} from 'coinbase-pro-node';
import {abs, log10} from 'mathjs';
import {USE_SANDBOX} from '.';
import {Currency, CurrencyModel} from './models';
import {getHash} from './utils';

let initialized: boolean = false;
const CURRENCIES = new Map<string, Currency>();

export interface CurrencyUpdate {
  updated: Currency[];
  added: Currency[];
  changes: string[];
}

export class Currencies {
  constructor() {}

  /**
   * Add the currency to the local memory and database.
   *
   * @param {Currency | Currency[]} currencies - Currency to update.
   * @returns {Promise<CurrencyUpdate>} Changed currencies compared to locally stored.
   */
  static async update(
    currencies: ICurrency | ICurrency[],
  ): Promise<CurrencyUpdate> {
    if (!Array.isArray(currencies)) currencies = [currencies];
    const info: CurrencyUpdate = {updated: [], added: [], changes: []};

    for (const c of currencies) {
      // Change it locally.
      const currency = Currencies.convert(c, USE_SANDBOX);

      // Check to see if it has been modified.
      const old = Currencies.get(c.id);
      if (old && getHash(old) === getHash(currency)) continue;

      // Label as either new or updated.
      if (!old) {
        info.added.push(currency);
        info.changes.push(`${c.id}: added.`);
      } else {
        // Is an update, add and calculate changes.
        info.updated.push(currency);
        info.changes.push(...Currencies.calcChanges(old, currency));
      }

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

    return info;
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

  /**
   * Compares the changes between two currencies, outlining their differences.
   *
   * @param {Product} oldCurrency - Original currency.
   * @param {Product} newCurrency - New currency.
   * @returns {string[]} Changes between the old version and the new version.
   */
  static calcChanges(oldCurrency: Currency, newCurrency: Currency): string[] {
    const pId: string = newCurrency.id;
    const changes: string[] = [];

    // Used to replace underscores with spaces.
    const r = (text: string): string => {
      return text.replace(/_/g, ' ');
    };

    for (let [key, value] of Object.entries(newCurrency)) {
      value = JSON.stringify(value);
      if (!Object.keys(oldCurrency).includes(key)) {
        changes.push(`${pId}: ['${r(key)}'] = '${value}' added.`);
        continue;
      }

      const oldValue = JSON.stringify(Object(oldCurrency)[key]);
      if (oldValue === value) continue;
      changes.push(
        `${pId}: ['${r(key)}'] changed from '${oldValue}' to '${value}'`,
      );
    }

    // Check if any were removed.
    for (let [key, value] of Object.entries(oldCurrency)) {
      value = JSON.stringify(value);
      if (!Object.keys(newCurrency).includes(key)) {
        changes.push(
          `${pId}: ['${r(key)}'] = '${JSON.stringify(value)}' removed.`,
        );
      }
    }

    return changes;
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
