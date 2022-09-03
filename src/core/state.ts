import {BucketData, createBuckets} from './bucket';
import {setToPast, setToZero} from './timespan';
import {Stopwatch} from './stopwatch';
import {schedule, validate} from 'node-cron';
import {dynamicDebug, dynamicErr, dynamicInfo, dynamicWarn} from '.';
import {makeRankings, ProductRanking} from './rank';
import {initProduct, ProductOptions, Products} from '../product';
import {AnonymousClient} from '../exchange-api/coinbase';
import {Currencies, initCurrency} from '../currency';
import {CandleOpts, CANDLES, getCandles, loadCandleData} from './candle';
import {delay} from '../utils';
import {APP_DEBUG} from '..';
import {SimpleCandle} from '../models/candle';

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

  constructor(config: CandleOpts) {
    const {candleSizeMin, candlesPerBucket} = config;
    if (60 % candleSizeMin !== 0) {
      throw new Error(
        `[dynamic] candle size of '${candleSizeMin}' is invalid. ` +
          `Must be divisible by 60.`,
      );
    } else if (candleSizeMin > 60) {
      throw new Error(
        `[dynamic] candle size of '${candleSizeMin}' is invalid. ` +
          `Cannot exceed 60.`,
      );
    } else if (candlesPerBucket < 2) {
      throw new Error(
        `[dynamic] bucket size of '${candlesPerBucket}' is invalid. ` +
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

  static getBuckets(productId: string): BucketData[] {
    const opts = State.config;
    let candles = CANDLES.get(productId) ?? [];

    if (candles.length < opts.totalCandleCount * 0.8) return [];
    return createBuckets(candles, opts);
  }

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

  static getRanking(productId: string): ProductRanking | undefined {
    return State.currentRankings.find((r) => r.productId === productId);
  }

  static getRankings(count: number = -1): ProductRanking[] {
    if (count < 0) return State.currentRankings;
    else if (count === 0) return [];
    else if (count > State.currentRankings.length) return State.currentRankings;
    return State.currentRankings.slice(0, count);
  }

  static setRankings(rankings: ProductRanking[]) {
    if (rankings.length === 0) return;
    State.currentRankings = rankings;
  }

  /**
   * Disable the dynamic state algorithm, preventing it from updating.
   */
  static disable() {
    if (!State.isEnabled) return;
    State.isEnabled = false;

    let msg = 'disabled';
    if (State.isUpdating) msg = `${msg}, but currently updating`;
    dynamicWarn(`${msg}.`);
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

        dynamicErr(`could not update data: ${errMsg}`);
      })
      .finally(() => {
        State.updating = false;
      });
  }

  /**
   * Wraps initState and initializes the Dynamic State.
   * A global object that handles the Dynamic Algorithm.
   *
   * @param {Object} opts - Options to modify how the Dynamic State works.
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
      const sTotal = (sw.print() / (i + 1)) * products.length - sw.print();
      dynamicDebug(
        `${(((i + 1) / products.length) * 100).toFixed(0)}% ` +
          `Processing: ${pId}  (est: ${sTotal.toFixed(0)}s remaining.)`,
        `\r`,
      );
    }

    const {candles} = (await loadCandleData(pId)) ?? [];
    if (candles.length > 0) {
      loaded++;
      CANDLES.set(pId, candles);
    }
  }

  dynamicInfo(`loaded ${loaded} product data, took ${sw.stop()} seconds.`);
  dynamicInfo(`dynamics timestamp: ${State.timestamp.toISOString()}.`);

  // Update the currencies.
  sw.restart();
  await updateCurrencies();
  dynamicDebug(`Currency updates execution took ${sw.stop()} seconds.`);

  // Update the products.
  sw.restart();
  await updateProducts();
  dynamicDebug(`Product updates execution took ${sw.stop()} seconds.`);

  // Run on periods of the candle size.
  const cronSchedule = `*/${opts.candleSizeMin} * * * *`;
  if (!validate(cronSchedule)) {
    throw new Error(`invalid cron schedule provided: '${cronSchedule}'`);
  }

  dynamicInfo(`update period of ${opts.candleSizeMin} min currently set.`);
  schedule(cronSchedule, State.updateDataWrapper);

  dynamicDebug(`Startup execution took ${sw.totalMs / 1000} seconds.`);
}

/**
 * Pull new candle data and process it.
 *
 * @returns {Promise<ProductRanking[]>} Ranked products from new data.
 */
async function updateData(): Promise<ProductRanking[]> {
  dynamicInfo('\nupdating data now!');
  const opts = State.config;

  // Update the currencies.
  const sw = new Stopwatch();
  await updateCurrencies();
  dynamicDebug(`Currency updates execution took ${sw.stop()} seconds.`);

  sw.restart();
  await updateProducts();
  const products = Products.filter(PRODUCT_OPTS).map((p) => p.id);
  dynamicDebug(`Product updates execution took ${sw.stop()} seconds.`);

  sw.restart();
  for (let i = 0; i < products.length; i++) {
    const pId = products[i];
    if (APP_DEBUG) {
      const sTotal = (sw.print() / (i + 1)) * products.length - sw.print();
      dynamicDebug(
        `${(((i + 1) / products.length) * 100).toFixed(0)}% ` +
          `Processing: ${pId}  (est: ${sTotal.toFixed(0)}s remaining.)`,
        `\r`,
      );
    }
    await getCandles(pId, opts);
  }
  dynamicDebug(`Candle polling execution took ${sw.stop()} seconds.`);

  // Get the bucket data from the candles.
  sw.restart();
  const buckets = State.getAllBuckets();
  dynamicDebug(`Bucket creation execution took ${sw.stop()} seconds.`);

  // Get the rankings.
  sw.restart();
  const rankings = makeRankings(buckets);
  State.setRankings(rankings);
  dynamicDebug(`Rank creation execution took ${sw.stop()} seconds.`);
  dynamicDebug(`Total execution took ${sw.totalMs / 1000} seconds.`);
  dynamicInfo('update complete.\n');

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
    if (err instanceof Error) dynamicErr(err.message);
    else {
      dynamicErr(`odd error... ${err}`);
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
    if (err instanceof Error) dynamicErr(err.message);
    else {
      dynamicErr(`odd error... ${err}`);
    }
  }
}
