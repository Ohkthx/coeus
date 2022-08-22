import {
  BucketData,
  createBuckets,
  getAvgBuckets,
  loadBucketData,
  saveBucketData,
} from './bucket';
import {getSpan, resizeSpan, setToPast, Timespan} from './timespan';
import {Stopwatch} from './stopwatch';
import {schedule, validate} from 'node-cron';
import {Candle} from 'coinbase-pro-node';
import {getPeriods, IntervalData, makeIntervals} from './interval';
import {
  dynamicDebug,
  dynamicErr,
  dynamicInfo,
  dynamicWarn,
  DYNAMIC_EVENT_NAME,
} from '.';
import {makeRankings, ProductRanking, sortIntervals} from './rank';
import {initProduct, ProductOptions, Products} from '../product';
import {dynamicAlgorithm} from './algorithm';
import EventEmitter from 'events';
import {APP_DEBUG} from '..';
import {AnonymousClient} from '../exchange-api/coinbase';
import {Currencies, initCurrency} from '../currency';

let CANDLE_DATA: Record<string, BucketData[]> = {};
let RANKINGS: ProductRanking[] = [];

const PRODUCT_OPTS: ProductOptions = {
  include: ['USD'],
  exclude: [],
  disabledTrades: false,
  stablepairs: false,
};

export interface StateConfig {
  periodSpan: number; // in DAYS.
  candleSize: number; // in MINUTES.
  bucketSize: number; // amount per bucket.
  intervals: number; // amount of intervals to compare.
  rankKeep: number; // Top # to keep in rankings.
}

export class DynamicState {
  private static initialized: boolean = false;
  private static stateConfig: StateConfig;
  private static eventEmitter: EventEmitter = new EventEmitter();
  private static updating: boolean = false;
  private static isEnabled: boolean = true;
  static timestamp: Date;

  constructor(config: StateConfig) {
    const {candleSize, bucketSize} = config;
    const updatePeriod = candleSize * bucketSize;
    if (60 % updatePeriod !== 0) {
      throw new Error(
        `[dynamic] candle size of '${candleSize}' is invalid with ` +
          `bucket size of '${bucketSize}'. A minute must be ` +
          `divisible by 'candle size' * 'bucket size'.`,
      );
    } else if (updatePeriod > 60) {
      throw new Error(
        `[dynamic] candle size of '${candleSize}' is invalid with ` +
          `bucket size of '${bucketSize}'. ` +
          `'candle size' * 'bucket size' cannot exceed 60.`,
      );
    } else if (bucketSize < 2) {
      throw new Error(
        `[dynamic] bucket size of '${bucketSize}' is invalid. ` +
          `It must have a value greater than 1.`,
      );
    }

    // Set the configuration.
    DynamicState.stateConfig = config;
    const {maxCandleCount} = DynamicState;

    // Correct the date.
    const n = new Date();
    DynamicState.timestamp = setToPast(n, maxCandleCount * candleSize);
  }

  static get isUpdating(): boolean {
    return DynamicState.updating;
  }

  static get config(): StateConfig {
    return DynamicState.stateConfig;
  }

  // Amount of DAYS in the period.
  static get periodSpan(): number {
    return DynamicState.config.periodSpan;
  }

  // Top # of ranking to keep.
  static get rankKeep(): number {
    return DynamicState.config.rankKeep;
  }

  // Amount of candles in a period for a product/pair.
  static get minCandleCount(): number {
    const {periodSpan, candleSize} = DynamicState;
    return (periodSpan * 24 * 60) / candleSize;
  }

  // Amount of buckets in a period for a product/pair.
  static get minBucketCount(): number {
    const {bucketSize} = DynamicState;
    return DynamicState.minCandleCount / bucketSize;
  }

  // Maximum amount of candles per product/pair.
  static get maxCandleCount(): number {
    const {minCandleCount, candleSize, intervals} = DynamicState;
    const candlesPerHr = 60 / candleSize;
    const extras = (intervals - 1) * candlesPerHr;

    return minCandleCount + extras;
  }

  // Maximum amount of buckets per product/pair.
  static get maxBucketCount(): number {
    const {minBucketCount, candleSize, bucketSize, intervals} = DynamicState;
    const bucketsPerHr = 60 / (candleSize * bucketSize);
    const extras = (intervals - 1) * bucketsPerHr;

    return minBucketCount + extras;
  }

  // Size of candle in MINUTES.
  static get candleSize(): number {
    return DynamicState.config.candleSize;
  }

  // Amount of candles to be bundled together.
  static get bucketSize(): number {
    return DynamicState.config.bucketSize;
  }

  // Amount of time between updates in MINUTES.
  static get updatePeriod(): number {
    return DynamicState.candleSize * DynamicState.bucketSize;
  }

  // Amount of intervals to pull data from.
  static get intervals(): number {
    return DynamicState.config.intervals;
  }

  /**
   * Get the amount of the bucket data for the product/pair.
   *
   * @param {string} productId - Product / Pair identification.
   * @returns {number} Amount of data currently tracking.
   */
  static getLength(productId: string): number {
    // Check if initialized on Dynamic State.
    if (!CANDLE_DATA[productId]) return 0;
    return CANDLE_DATA[productId].length;
  }

  /**
   * Get the last timestamp of the bucket data for the product/pair.
   *
   * @param {string} productId - Product / Pair identification.
   * @returns {string} Timestamp in ISO format.
   */
  static getTimestamp(productId: string): string {
    const count = DynamicState.getLength(productId);
    if (count === 0) {
      const {timestamp, maxCandleCount, candleSize} = DynamicState;

      return setToPast(timestamp, maxCandleCount * candleSize).toISOString();
    }

    return CANDLE_DATA[productId][count - 1].timestampISO;
  }

  /**
   * Get the bucket data from the Dynamic State.
   *
   * @param {string} productId - Product / Pair identification.
   * @returns {BucketData[]} Buckets of candles belonging to product/pair.
   */
  static getBuckets(productId: string): BucketData[] {
    // Check if initialized on Dynamic State.
    if (!CANDLE_DATA[productId]) {
      CANDLE_DATA[productId] = [];
    }

    return CANDLE_DATA[productId];
  }

  /**
   * Adds bucket data to the Dynamic State.
   *
   * @param {string} productId - Product / Pair identification.
   * @param {BucketData[]} buckets - Buckets of candles to add.
   */
  static addData(productId: string, buckets: BucketData[]) {
    // Check if initialized on Dynamic State.
    if (!CANDLE_DATA[productId]) {
      CANDLE_DATA[productId] = [];
    }

    const candleData = CANDLE_DATA[productId];
    // Cycle old buckets out to replace with newer.
    if (candleData.length !== 0 && buckets.length > 0) {
      candleData.splice(0, buckets.length);
    }

    // Add new buckets to the end of the array.
    candleData.push(...buckets);
  }

  /**
   * Get the results from the algorithm unaltered.
   *
   * @returns {ProductRanking[]} Results in order from best to worst.
   */
  static getRawRankings(): ProductRanking[] {
    return RANKINGS;
  }

  /**
   * Get the results from the algorithm based on data provided by user.
   *
   * @param {number} buyPercentage - Percentage of first purchase in decimal form.
   * @returns {ProductRanking[]} Results in order from best to worst.
   */
  static getModifiedRankings(buyPercentage: number): ProductRanking[] {
    return dynamicAlgorithm(RANKINGS, buyPercentage);
  }

  /**
   * Allows for clients to subscribe to events.
   *
   * @param {string} eventName - Name of the event to subscribe to.
   * @param {function} callback - Callback function.
   */
  static on(
    eventName: string,
    callback: (ranks: ProductRanking[]) => Promise<void>,
  ) {
    DynamicState.eventEmitter.on(eventName, callback);
  }

  /**
   * Allows for clients to unsubscribe to events.
   *
   * @param {string} eventName - Name of the event to unsubscribe to.
   * @param {function} callback - Callback function to remove.
   */
  static off(eventName: string, callback: (ranks: ProductRanking[]) => void) {
    DynamicState.eventEmitter.off(eventName, callback);
  }

  /**
   * Disable the dynamic state algorithm, preventing it from updating.
   */
  static disable() {
    if (!DynamicState.isEnabled) return;
    DynamicState.isEnabled = false;

    let msg = 'disabled';
    if (DynamicState.isUpdating) msg = `${msg}, but currently updating`;
    dynamicWarn(`${msg}.`);
  }

  /**
   * Wraps updateData to catch thrown errors.
   */
  static async updateDataWrapper() {
    // Prevent running the updater while it already is running or disabled.
    if (DynamicState.isUpdating || !DynamicState.isEnabled) return;
    DynamicState.updating = true;

    await updateData()
      .then((data) => {
        if (!data || data.length === 0) return;
        DynamicState.eventEmitter.emit(DYNAMIC_EVENT_NAME, data);
      })
      .catch((err) => {
        let errMsg = 'unknown error';
        if (err.response) errMsg = err.response.data.message;
        else if (err instanceof Error) errMsg = err.message;
        else errMsg = err;

        dynamicErr(`could not update data: ${errMsg}`);
      })
      .finally(() => {
        DynamicState.updating = false;
      });
  }

  /**
   * Wraps initDynamicState and initializes the Dynamic State.
   * A global object that handles the Dynamic Algorithm.
   *
   * @param {Object} options - Options to modify how the Dynamic State works.
   * @param {number} options.periodSpan - Amount of DAYS in the period.
   * @param {number} options.candleSize - Size of candle in MINUTES.
   * @param {number} options.bucketSize - Amount of candles to be bundled together.
   * @param {number} options.intervals - Amount of intervals to generate rankings from.
   */
  static async initWrapper(options: StateConfig) {
    // Prevent reinitialization.
    if (DynamicState.initialized || !DynamicState.isEnabled) return;

    DynamicState.updating = true;
    await initDynamicState(options)
      .then((data) => {
        if (!data || data.length === 0) return;
        DynamicState.eventEmitter.emit(DYNAMIC_EVENT_NAME, data);
      })
      .finally(() => {
        DynamicState.initialized = true;
        DynamicState.updating = false;
      });
  }
}

/**
 * Initializes the Dynamic State. A global object that handles the Dynamic Algorithm.
 *
 * @param {Object} options - Options to modify how the Dynamic State works.
 * @param {number} options.periodSpan - Amount of DAYS in the period.
 * @param {number} options.candleSize - Size of candle in MINUTES.
 * @param {number} options.bucketSize - Amount of candles to be bundled together.
 * @param {number} options.intervals - Amount of intervals to generate rankings from.
 * @returns {Promise<ProductRanking[]>} Ranked products from old data.
 */
async function initDynamicState(
  options: StateConfig,
): Promise<ProductRanking[]> {
  new DynamicState(options);

  // Load all of the products and currencies.
  await initProduct();
  await initCurrency();

  // Load all data and get new timestamp.
  const sw = new Stopwatch();
  const candleData = await loadBucketData();
  CANDLE_DATA = candleData;
  sw.stop();

  let loaded: number = 0;
  let timestamp: string = DynamicState.timestamp.toISOString();
  for (const pId in candleData) {
    const data = candleData[pId];
    if (data.length > 0 && data[data.length - 1].timestampISO > timestamp) {
      timestamp = data[data.length - 1].timestampISO;
    }
    loaded++;
  }

  dynamicInfo(
    `loaded ${loaded} product data, took ${sw.lastMS / 1000} seconds.`,
  );
  dynamicInfo(`dynamics timestamp: ${timestamp}.`);

  // Set the date to the newer date.
  DynamicState.timestamp = new Date(timestamp);

  // Update the currencies.
  sw.restart();
  await updateCurrencies();
  dynamicDebug(`Currency updates execution took ${sw.stop()} seconds.`);

  // Update the products.
  sw.restart();
  await updateProducts();
  dynamicDebug(`Product updates execution took ${sw.stop()} seconds.`);

  // Create intervals from the candles.
  sw.restart();
  const intervals = getIntervals(CANDLE_DATA, options.intervals);
  dynamicDebug(`Interval creation execution took ${sw.stop()} seconds.`);

  // Get the rankings.
  sw.restart();
  await getRankings(intervals);
  dynamicDebug(`Rank creation execution took ${sw.stop()} seconds.`);

  // Run on periods of the candle size.
  const cronSchedule = `*/${options.candleSize} * * * *`;
  if (!validate(cronSchedule)) {
    throw new Error(`invalid cron schedule provided: '${cronSchedule}'`);
  }

  dynamicInfo(
    `update period of ${DynamicState.updatePeriod} min currently set.`,
  );
  schedule(cronSchedule, DynamicState.updateDataWrapper);

  dynamicDebug(`Startup execution took ${sw.totalMs / 1000} seconds.`);

  return RANKINGS;
}

/**
 * Pull new candle data and process it.
 *
 * @returns {Promise<ProductRanking[]>} Ranked products from new data.
 */
async function updateData(): Promise<ProductRanking[]> {
  // Check the hour to the update interval.
  const now = new Date();
  const remainder = now.getMinutes() % DynamicState.updatePeriod;
  if (remainder !== 0) {
    // Not time to update.
    const timeUntil = DynamicState.updatePeriod - remainder;
    dynamicInfo(`updating in ${timeUntil} min.`);
    return [];
  }

  dynamicInfo('\nupdating data now!');
  const {maxCandleCount, candleSize, intervals, timestamp} = DynamicState;

  // Get the span between last timestamp and now.
  const span = getSpan(timestamp, candleSize);
  const {granularity, end} = resizeSpan(span, maxCandleCount * candleSize);

  // Set the timestamp to be the most current.
  DynamicState.timestamp = end;

  // Update the currencies.
  const sw = new Stopwatch();
  await updateCurrencies();
  dynamicDebug(`Currency updates execution took ${sw.stop()} seconds.`);

  sw.restart();
  await updateProducts();
  const products = Products.filter(PRODUCT_OPTS).map((p) => p.id);
  dynamicDebug(`Product updates execution took ${sw.stop()} seconds.`);

  sw.restart();
  const candles = await obtainCandles(products, span, granularity);
  dynamicDebug(`Candle polling execution took ${sw.stop()} seconds.`);

  // Get the bucket data from the candles.
  sw.restart();
  await applyBuckets(span, candles);
  dynamicDebug(`Bucket creation execution took ${sw.stop()} seconds.`);

  // Create intervals from the candles.
  sw.restart();
  const intervalData = getIntervals(CANDLE_DATA, intervals);
  dynamicDebug(`Interval creation execution took ${sw.stop()} seconds.`);

  // Get the rankings.
  sw.restart();
  await getRankings(intervalData);
  dynamicDebug(`Rank creation execution took ${sw.stop()} seconds.`);
  dynamicDebug(`Total execution took ${sw.totalMs / 1000} seconds.`);

  const res = DynamicState.getRawRankings();
  dynamicDebug(`\nRankings:`);
  if (res.length === 0) dynamicDebug('none.');
  for (const r of res) {
    const {last, ema7, ema14} = r;
    const close = `close: ${last.close}`;
    const mov = `mov: ${last.movement}`;
    const ema = `ema7: ${ema7}, ema14: ${ema14}`;
    dynamicDebug(
      ` ${r.productId}: ${r.rating.value}, ${close}, ${mov}, ${ema}`,
    );
  }
  dynamicInfo('update complete.\n');
  return res;
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

/**
 * Gets candles for all valid products/pairs.
 */
async function obtainCandles(
  products: string[],
  baseSpan: Timespan,
  granularity: number,
): Promise<Record<string, Candle[]>> {
  const {end} = baseSpan;
  const {candleSize, maxCandleCount} = DynamicState;
  const candles: Record<string, Candle[]> = {};

  // Create the padding for output.
  const maxLen = products.length.toString();
  const pad = maxLen.length;

  let i: number = 0;
  for (const pId of products) {
    // Get the span between last timestamp and now.
    const span = getSpan(
      new Date(DynamicState.getTimestamp(pId)),
      candleSize,
      end,
    );
    const {start} = resizeSpan(span, maxCandleCount * candleSize);

    if (APP_DEBUG) {
      const value: string = `${(++i).toString().padEnd(pad)}`;
      const counter = `${value} / ${maxLen.padEnd(pad)}`;
      dynamicDebug(`[${counter}] pulling candles for '${pId}'.`, '\r');
    }

    // Pull the candles from the API.
    try {
      const c = await AnonymousClient.getCandles(pId, granularity, start, end);
      candles[pId] = c;
    } catch (err) {
      if (err instanceof Error) dynamicErr(err.message);
      else {
        dynamicErr(`odd error... ${err}`);
      }
    }
  }

  return candles;
}

/**
 * Converts candles into buckets.
 */
async function applyBuckets(
  baseSpan: Timespan,
  candles: Record<string, Candle[]>,
) {
  const {end} = baseSpan;
  const {maxBucketCount, candleSize, bucketSize, maxCandleCount} = DynamicState;

  // Create the padding for output.
  const maxLen = Object.keys(candles).length.toString();
  const pad = maxLen.length;

  let i: number = 0;
  for (const pId in candles) {
    const span = getSpan(
      new Date(DynamicState.getTimestamp(pId)),
      candleSize,
      end,
    );
    const {lengthMs} = resizeSpan(span, maxCandleCount * candleSize);

    // Split the candles into buckets.
    const {buckets} = createBuckets(
      candles[pId],
      candleSize,
      bucketSize,
      lengthMs,
    );

    if (APP_DEBUG) {
      const value: string = `${(++i).toString().padEnd(pad)}`;
      const counter = `${value} / ${maxLen.padEnd(pad)}`;
      dynamicDebug(`[${counter}] saving '${pId}'.`, '\r');
    }

    // Add the data to the state and database.
    DynamicState.addData(pId, buckets);
    await saveBucketData(pId, buckets, maxBucketCount);
  }
}

/**
 * Convert Bucket Data into intervals of the period size.
 */
function getIntervals(
  candleData: Record<string, BucketData[]>,
  intervals: number,
): IntervalData[][] {
  const {maxCandleCount, candleSize, bucketSize, minBucketCount} = DynamicState;

  // Get start date (earliest) for periods.
  const ts = new Date(DynamicState.timestamp.toISOString());
  ts.setMinutes(ts.getMinutes() - maxCandleCount * candleSize);

  // Amount of time per bucket.
  const bucketLen = candleSize * bucketSize;

  // Amount of data entries to offset by.
  const offset = 60 / bucketLen;

  // Create the periods.
  const periods = getPeriods(
    ts.toISOString(),
    intervals,
    offset,
    minBucketCount,
    bucketLen,
  );

  // Consist of the average amount of data for each product/pair.
  const minSize = getAvgBuckets(candleData);

  // Create the intervals based on periods.
  return makeIntervals(periods, candleData, minSize, intervals);
}

/**
 * Create the rankings from the supplied intervals.
 */
async function getRankings(intervals: IntervalData[][]) {
  const {rankKeep, timestamp} = DynamicState;

  // Sort the intervals, keeping the top {rankKeep} amount.
  sortIntervals(intervals, rankKeep);

  // Create the rankings.
  RANKINGS = await makeRankings(intervals, timestamp.toISOString());
}
