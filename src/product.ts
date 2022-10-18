import {Product as IProduct} from 'coinbase-pro-node';
import {abs, log10} from 'mathjs';
import {USE_SANDBOX} from '.';
import {Product, ProductModel} from './models';
import {getHash, parseBoolean} from './utils';

let initialized: boolean = false;
const PRODUCTS = new Map<string, Product>();
const STABLE_IDENTIFIER: string = 'fx_stablecoin';

export interface ProductUpdate {
  updated: Product[];
  added: Product[];
  changes: string[];
}

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
   * @returns {Promise<ProductUpdate>} Changed products compared to stored locally.
   */
  static async update(products: IProduct | IProduct[]): Promise<ProductUpdate> {
    if (!Array.isArray(products)) products = [products];
    const info: ProductUpdate = {updated: [], added: [], changes: []};

    for (const p of products) {
      // Change it locally.
      const product = Products.convert(p, USE_SANDBOX);

      // Check to see if it has been modified.
      const old = Products.get(p.id);
      if (old && getHash(old) === getHash(product)) continue;

      // Label as either new or updated.
      if (!old) {
        info.added.push(product);
        info.changes.push(`${p.id}: added.`);
      } else {
        // Is an update, add and calculate changes.
        info.updated.push(product);
        info.changes.push(...Products.calcChanges(old, product));
      }

      PRODUCTS.set(p.id, Products.clean(product));

      // Update the database.
      await ProductModel.updateOne(
        {id: p.id, useSandbox: USE_SANDBOX},
        product,
        {
          upsert: true,
        },
      );
    }

    return info;
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
   * Obtains all of the currently held products.
   *
   * @returns {Product[]} List of all products.
   */
  static getAll(): Product[] {
    return [...PRODUCTS.values()];
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
      if (!stablepairs && product.stable_pair) continue;

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

  /**
   * Strips any other potentially held data from the product.
   *
   * @param {Product} product - Product to remove data from.
   * @returns {Product} Freshly cleaned product.
   */
  static clean(product: Product): Product {
    return <Product>{
      id: product.id,
      useSandbox: product.useSandbox,
      stable_pair: product.stable_pair,
      quote_currency: product.quote_currency,
      base_min_size: product.base_min_size,
      base_max_size: product.base_max_size,
      quote_increment: product.quote_increment,
      base_increment: product.base_increment,
      display_name: product.display_name,
      min_market_funds: product.min_market_funds,
      max_market_funds: product.max_market_funds,
      margin_enabled: product.margin_enabled,
      cancel_only: product.cancel_only,
      limit_only: product.limit_only,
      post_only: product.post_only,
      status: product.status,
      status_message: product.status_message,
      trading_disabled: product.trading_disabled,
    };
  }

  /**
   * Converts an API version of a product to a locally stored type.
   *
   * @param {IProduct} apiProduct - API version of the product.
   * @param {boolean} sandbox - Production or Sandbox version.
   * @returns {Product} Converted product.
   */
  static convert(apiProduct: IProduct, sandbox: boolean): Product {
    let isStable: boolean = false;
    for (const [key, value] of Object.entries(apiProduct)) {
      if (key !== STABLE_IDENTIFIER) continue;
      isStable = parseBoolean(value);
      break;
    }

    return <Product>{
      id: apiProduct.id,
      useSandbox: sandbox,
      stable_pair: isStable,
      quote_currency: apiProduct.quote_currency,
      base_min_size: apiProduct.base_min_size,
      base_max_size: apiProduct.base_max_size,
      quote_increment: apiProduct.quote_increment,
      base_increment: apiProduct.base_increment,
      display_name: apiProduct.display_name,
      min_market_funds: apiProduct.min_market_funds,
      max_market_funds: apiProduct.max_market_funds,
      margin_enabled: apiProduct.margin_enabled,
      cancel_only: apiProduct.cancel_only,
      limit_only: apiProduct.limit_only,
      post_only: apiProduct.post_only,
      status: apiProduct.status,
      status_message: apiProduct.status_message,
      trading_disabled: apiProduct.trading_disabled,
    };
  }

  /**
   * Compares the changes between two products, outlining their differences.
   *
   * @param {Product} oldProduct - Original product.
   * @param {Product} newProduct - New product.
   * @returns {string[]} Changes between the old version and the new version.
   */
  static calcChanges(oldProduct: Product, newProduct: Product): string[] {
    const pId: string = newProduct.id;
    const changes: string[] = [];

    // Used to replace underscores with spaces.
    const r = (text: string): string => {
      return text.replace(/_/g, ' ');
    };

    for (let [key, value] of Object.entries(newProduct)) {
      value = JSON.stringify(value);

      if (!Object.keys(oldProduct).includes(key)) {
        changes.push(`${pId}: ['${r(key)}'] = '${value}' added.`);
        continue;
      }

      const oldValue = JSON.stringify(Object(oldProduct)[key]);
      if (oldValue === value) continue;
      changes.push(
        `${pId}: ['${r(key)}'] changed from '${oldValue}' to '${value}'`,
      );
    }

    // Check if any were removed.
    for (let [key, value] of Object.entries(oldProduct)) {
      value = JSON.stringify(value);
      if (!Object.keys(newProduct).includes(key)) {
        changes.push(`${pId}: ['${r(key)}'] = '${value}' removed.`);
      }
    }

    return changes;
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

  // Clean and store the data locally.
  for (const p of products) {
    PRODUCTS.set(p.id, Products.clean(p));
  }
}
