import {BucketData, createBuckets} from './bucket';
import {setToZero} from './timespan';
import {Stopwatch} from './stopwatch';
import {schedule, validate} from 'node-cron';
import {coreDebug, coreErr, coreInfo, coreWarn} from '.';
import {makeRankings, ProductRanking} from './rank';
import {initProduct, ProductOptions, Products} from '../product';
import {AnonymousClient} from '../exchange-api/coinbase';
import {Currencies, initCurrency} from '../currency';
import {CandleOpts, CANDLES, getCandles, loadCandleData} from './candle';
import {delay} from '../utils';
import {APP_DEBUG} from '..';

const PRODUCT_OPTS: ProductOptions = {
  include: ['USD'],
  exclude: [],
  disabledTrades: false,
  stablepairs: false,
};

export class State {
  private static initialized: boolean = false;
  private static stateConfig: CandleOpts;
  private static updating: boolean = false;
  private static isEnabled: boolean = true;
  private static currentRankings: ProductRanking[] = [];

  /**
   * Creates a new static State.
   *
   * @param {CandleOpts} config - Configuration to use for processing.
   */
  constructor(config: CandleOpts) {
    const {candleSizeMin, candlesPerBucket} = config;
    if (60 % candleSizeMin !== 0) {
      throw new Error(
        `[core] candle size of '${candleSizeMin}' is invalid. ` +
          `Must be divisible by 60.`,
      );
    } else if (candleSizeMin > 60) {
      throw new Error(
        `[core] candle size of '${candleSizeMin}' is invalid. ` +
          `Cannot exceed 60.`,
      );
    } else if (candlesPerBucket < 2) {
      throw new Error(
        `[core] bucket size of '${candlesPerBucket}' is invalid. ` +
          `It must have a value greater than 1.`,
      );
    }

    // Set the configuration.
    State.stateConfig = config;
  }

  static get isUpdating(): boolean {
    return State.updating;
  }

  static get timestamp(): Date {
    return setToZero(new Date(), State.stateConfig.candleSizeMin);
  }

  static get config(): CandleOpts {
    const opts = State.stateConfig;
    return new CandleOpts(
      opts.granularity,
      State.timestamp,
      opts.candlesPerBucket,
      opts.totalBuckets,
    );
  }

  /**
   * Get all of the buckets associated with a product/pair.
   *
   * @param {string} productId - Product/pair Id
   * @returns {BucketData[]} Compiled data from the candles for the product/pair.
   */
  static getBuckets(productId: string): BucketData[] {
    const opts = State.config;
    let candles = CANDLES.get(productId) ?? [];
    if (candles.length === 0) return [];

    return createBuckets(candles, opts);
  }

  /**
   * Get all of the data for all known product/pairs.
   *
   * @returns {Map<string, BucketData[]>} Map of data, key: productId, value: data.
   */
  static getAllBuckets(): Map<string, BucketData[]> {
    const products = Products.filter(PRODUCT_OPTS).map((p) => p.id);
    const buckets = new Map<string, BucketData[]>();

    for (const pId of products) {
      const b = State.getBuckets(pId);
      if (b.length === 0) continue;
      buckets.set(pId, b);
    }

    return buckets;
  }

  /**
   * Get the rankings for a specific product/pair.
   *
   * @param {string} productId - Product/pair Id to get ranking for.
   * @returns {ProductRanking | undefined} Product ranking if it is found.
   */
  static getRanking(productId: string): ProductRanking | undefined {
    return State.currentRankings.find((r) => r.productId === productId);
  }

  /**
   * Get all of the rankings for the known products/pairs.
   *
   * @param {number} count - Limits the amount obtained. Default is obtain all.
   * @returns {ProductRanking[]} Sorted rankings from "best" to "worst"
   */
  static getRankings(count: number = -1): ProductRanking[] {
    if (count < 0) return State.currentRankings;
    else if (count === 0) return [];
    else if (count > State.currentRankings.length) return State.currentRankings;
    return State.currentRankings.slice(0, count);
  }

  /**
   * Overrides the current rankings with the ones provided.
   *
   * @param {ProductRanking[]} rankings - Rankings to override with.
   */
  static setRankings(rankings: ProductRanking[]) {
    if (rankings.length === 0) return;
    State.currentRankings = rankings;
  }

  /**
   * Disable the state, preventing it from updating.
   */
  static disable() {
    if (!State.isEnabled) return;
    State.isEnabled = false;

    let msg = 'disabled';
    if (State.isUpdating) msg = `${msg}, but currently updating`;
    coreWarn(`${msg}.`);
  }

  /**
   * Wraps updateData to catch thrown errors.
   */
  static async updateDataWrapper() {
    // Prevent running the updater while it already is running or disabled.
    await delay(20000);
    if (State.isUpdating || !State.isEnabled) return;
    State.updating = true;

    await updateData()
      .then(() => {})
      .catch((err) => {
        let errMsg = 'unknown error';
        if (err.response) errMsg = err.response.data.message;
        else if (err instanceof Error) errMsg = err.message;
        else errMsg = err;

        coreErr(`could not update data: ${errMsg}`);
      })
      .finally(() => {
        State.updating = false;
      });
  }

  /**
   * Wraps initState and initializes the state.
   * A global object that handles the data.
   *
   * @param {Object} opts - Options to modify how the state works.
   * @param {number} opts.periodSpan - Amount of DAYS in the period.
   * @param {number} opts.candleSize - Size of candle in MINUTES.
   * @param {number} opts.bucketSize - Amount of candles to be bundled together.
   * @param {number} opts.intervals - Amount of intervals to generate rankings from.
   */
  static async initWrapper(opts: CandleOpts) {
    // Prevent reinitialization.
    if (State.initialized || !State.isEnabled) return;

    State.updating = true;
    await initState(opts)
      .then(() => {})
      .finally(() => {
        State.initialized = true;
        State.updating = false;
      });
  }
}

/**
 * Initialized the state, using the options provided.
 *
 * @param {CandleOpts} opts - Options for processing candles and buckets.
 */
async function initState(opts: CandleOpts) {
  new State(opts);

  // Load all of the products and currencies.
  await initProduct();
  await initCurrency();

  // Load all data and get new timestamp.
  const sw = new Stopwatch();
  let loaded: number = 0;
  const products = Products.filter(PRODUCT_OPTS).map((p) => p.id);
  for (let i = 0; i < products.length; i++) {
    const pId = products[i];
    if (APP_DEBUG) {
      const ts = sw.print();
      const sTotal = (ts / (i + 1)) * products.length;
      coreDebug(
        `${(((i + 1) / products.length) * 100).toFixed(0)}% ` +
          `Processing: ${pId}  (${ts.toFixed(0)}s / ${sTotal.toFixed(0)}s)`,
        `\r`,
      );
    }

    const {candles} = (await loadCandleData(pId)) ?? [];
    if (candles.length > 0) {
      loaded++;
      CANDLES.set(pId, candles);
    }
  }

  coreInfo(`loaded ${loaded} product data, took ${sw.stop()} seconds.`);

  // Get the bucket data from the candles.
  sw.restart();
  const buckets = State.getAllBuckets();
  coreDebug(`Bucket creation execution took ${sw.stop()} seconds.`);

  // Get the rankings.
  sw.restart();
  const rankings = makeRankings(buckets);
  State.setRankings(rankings);
  coreDebug(`Rank creation execution took ${sw.stop()} seconds.`);

  coreInfo(`timestamp: ${State.timestamp.toISOString()}.`);

  // Update the currencies.
  sw.restart();
  await updateCurrencies();
  coreDebug(`Currency updates execution took ${sw.stop()} seconds.`);

  // Update the products.
  sw.restart();
  await updateProducts();
  coreDebug(`Product updates execution took ${sw.stop()} seconds.`);

  // Run on periods of the candle size.
  const cronSchedule = `*/${opts.candleSizeMin} * * * *`;
  if (!validate(cronSchedule)) {
    throw new Error(`invalid cron schedule provided: '${cronSchedule}'`);
  }

  coreInfo(`update period of ${opts.candleSizeMin} min currently set.`);
  schedule(cronSchedule, State.updateDataWrapper);

  coreDebug(`Startup execution took ${sw.totalMs / 1000} seconds.`);
}

/**
 * Pull new candle data and process it.
 *
 * @returns {Promise<ProductRanking[]>} Ranked products from new data.
 */
async function updateData(): Promise<ProductRanking[]> {
  coreInfo('\nupdating data now!');
  const opts = State.config;

  // Update the currencies.
  const sw = new Stopwatch();
  await updateCurrencies();
  coreDebug(`Currency updates execution took ${sw.stop()} seconds.`);

  sw.restart();
  await updateProducts();
  const products = Products.filter(PRODUCT_OPTS).map((p) => p.id);
  coreDebug(`Product updates execution took ${sw.stop()} seconds.`);

  sw.restart();
  for (let i = 0; i < products.length; i++) {
    const pId = products[i];
    if (APP_DEBUG) {
      const ts = sw.print();
      const sTotal = (ts / (i + 1)) * products.length;
      coreDebug(
        `${(((i + 1) / products.length) * 100).toFixed(0)}% ` +
          `Processing: ${pId}  (${ts.toFixed(0)}s / ${sTotal.toFixed(0)}s)`,
        `\r`,
      );
    }
    await getCandles(pId, opts);
  }
  coreDebug(`Candle polling execution took ${sw.stop()} seconds.`);

  // Get the bucket data from the candles.
  sw.restart();
  const buckets = State.getAllBuckets();
  coreDebug(`Bucket creation execution took ${sw.stop()} seconds.`);

  // Get the rankings.
  sw.restart();
  const rankings = makeRankings(buckets);
  State.setRankings(rankings);
  coreDebug(`Rank creation execution took ${sw.stop()} seconds.`);
  coreDebug(`Total execution took ${sw.totalMs / 1000} seconds.`);
  coreInfo('update complete.\n');

  return rankings;
}

/**
 * Update products.
 */
async function updateProducts() {
  // Get the products.
  try {
    const products = await AnonymousClient.getProducts();
    await Products.update(products);
  } catch (err) {
    if (err instanceof Error) coreErr(err.message);
    else {
      coreErr(`odd error... ${err}`);
    }
  }
}

/**
 * Update currencies.
 */
async function updateCurrencies() {
  // Get the currencies.
  try {
    const currencies = await AnonymousClient.getCurrencies();
    await Currencies.update(currencies);
  } catch (err) {
    if (err instanceof Error) coreErr(err.message);
    else {
      coreErr(`odd error... ${err}`);
    }
  }
}
