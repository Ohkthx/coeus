import {Product as IProduct} from 'coinbase-pro-node';
import {abs, log10} from 'mathjs';
import {USE_SANDBOX} from '.';
import {Product, ProductModel} from './models';

let initialized: boolean = false;
const PRODUCTS = new Map<string, Product>();

export interface ProductOptions {
  include?: string[];
  exclude?: string[];
  stablepairs?: boolean;
  disabledTrades?: boolean;
}

export class Products {
  constructor() {}

  /**
   * Add the product to the local memory and database.
   *
   * @param {Product | Product[]} products - Product/pair(s) to update.
   */
  static async update(products: IProduct | IProduct[]) {
    if (!Array.isArray(products)) products = [products];

    for (const p of products) {
      // Change it locally.
      const product = <Product>p;
      product.useSandbox = USE_SANDBOX;
      PRODUCTS.set(p.id, product);

      // Update the database.
      await ProductModel.updateOne(
        {id: p.id, useSandbox: USE_SANDBOX},
        product,
        {
          upsert: true,
        },
      );
    }
  }

  /**
   * Get a specific product.
   *
   * @param {string} productId - Product / pair to try and resolve.
   * @returns {Product | undefined} Product if found, otherwise undefined.
   */
  static get(productId: string): Product | undefined {
    return PRODUCTS.get(productId);
  }

  /**
   * Get the precision for the product (how many decimal places to round to.
   *
   * @param {string} productId - Product to pull information for.
   * @returns {{base: number, quote: number}} Precisions for both base and quote.
   */
  static getPrecisions(productId: string): {base: number; quote: number} {
    const product = PRODUCTS.get(productId);
    if (!product) {
      throw new Error(`invalid product id, cannot get precisions.`);
    }
    const baseInc = parseFloat(product.base_increment);
    const quoteInc = parseFloat(product.quote_increment);

    return {
      base: abs(log10(baseInc)),
      quote: abs(log10(quoteInc)),
    };
  }

  /**
   * Filter through all pairs / products currently accessible with filters.
   *
   * @param {Object} opts - Options to change products returned.
   * @param {string[]} opts.include - Base / Quote currency that has to be in the pairs.
   * @param {string[]} opts.exclude - Base / Quote currency that cannot be in the pairs.
   * @param {boolean} opts.stablepairs - Get stable pairs in results.
   * @param {boolean} opts.disabledTrades - Get disabled trades.
   * @returns {Product[]} List of products / pairs.
   */
  static filter(opts?: ProductOptions): Product[] {
    // Parse the options.
    let stablepairs: boolean = true;
    let disabledTrades: boolean = true;
    let include: string[] = [];
    let exclude: string[] = [];
    if (opts !== undefined) {
      if (opts.include !== undefined) include = opts.include;
      if (opts.exclude !== undefined) exclude = opts.exclude;
      if (opts.stablepairs !== undefined) stablepairs = opts.stablepairs;
      if (opts.disabledTrades !== undefined)
        disabledTrades = opts.disabledTrades;
    }

    // BTC-USD base: BTC
    // BTC-USD quote: USD
    const ids: Product[] = [];
    for (const product of PRODUCTS.values()) {
      const baseId = product.base_currency;
      const quoteId = product.quote_currency;

      // Do not get disabled trades if selected.
      if (
        !disabledTrades &&
        (product.trading_disabled ||
          product.post_only ||
          product.limit_only ||
          product.cancel_only)
      ) {
        continue;
      }

      // Include stablepairs?
      const stable = 'fx_stablecoin';
      const p = JSON.parse(JSON.stringify(product));
      if (!stablepairs && stable in p && p[stable] === true) {
        continue;
      }

      // Only add products that are on the inclusion list (if applicable)
      if (include.length !== 0) {
        if (!include.includes(baseId) && !include.includes(quoteId)) {
          continue;
        }
      }

      // Filter if they are on the exclusion list (if applicable)
      if (exclude.length !== 0) {
        if (exclude.includes(baseId) || exclude.includes(quoteId)) {
          continue;
        }
      }

      ids.push(product);
    }

    return ids;
  }
}

/**
 * Trims a number to the desired amount of decimal places.
 * 'BTC-USD' => base: 'BTC', quote: 'USD'
 *
 * @param {string} productId - Product/pair to use for rounding.
 * @param {number} value - Number to adjust.
 * @param {string} type - Determine to use 'base' or 'quote' decimals.
 * @returns {number} Newly formatted number.
 */
export function toFixed(
  productId: string,
  value: number,
  type: 'base' | 'quote' = 'base',
): number {
  let increment: number = 8;

  const product = PRODUCTS.get(productId);
  if (product) {
    increment = parseFloat(product[`${type}_increment`]) ?? increment;
  }

  const dec = abs(log10(increment));
  return parseFloat(value.toFixed(dec));
}

/**
 * Get the minimum sizes for both the 'base' and 'quote' of the product.
 *
 * @param {string} productId - Product to pull information for.
 * @returns {{base: number, quote: number}} Minimum sizes.
 */
export function minimumSize(productId: string): {base: number; quote: number} {
  const product = PRODUCTS.get(productId);
  if (!product) {
    throw new Error(`invalid product id, cannot get minimum sizes.`);
  }

  return {
    base: parseFloat(product.base_min_size),
    quote: parseFloat(product.min_market_funds),
  };
}

/**
 * Get the minimum amount for both the 'base' and 'quote' of the product.
 *
 * @param {string} productId - Product to pull information for.
 * @returns {{base: number, quote: number}} Minimum increments.
 */
export function minimumIncrement(productId: string): {
  base: number;
  quote: number;
} {
  const product = PRODUCTS.get(productId);
  if (!product) {
    throw new Error(`invalid product id, cannot get minimum increments.`);
  }

  return {
    base: parseFloat(product.base_increment),
    quote: parseFloat(product.quote_increment),
  };
}

/**
 * Initialize product by loading it from the database.
 */
export async function initProduct() {
  if (initialized) return;

  // Pull the information from the db and assign.
  const products = await ProductModel.find({useSandbox: USE_SANDBOX}, null, {
    lean: true,
  });
  for (const p of products) {
    PRODUCTS.set(p.id, p);
  }
}
