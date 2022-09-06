import {Candle} from 'coinbase-pro-node';
import {USE_SANDBOX} from '..';
import {AnonymousClient} from '../exchange-api/coinbase';
import {CandleData, CandleDataModel, SimpleCandle} from '../models/candle';
import {getSpan} from './timespan';

export const ONE_DAY_TO_S: number = 86400;
export const ONE_HOUR_TO_S: number = 3600;
export const ONE_MINUTE_TO_S: number = 60;

// All of the loaded candles for each product/pair.
export const CANDLES = new Map<string, SimpleCandle[]>();

export class CandleOpts {
  granularity: number;
  end: Date;
  candlesPerBucket: number;
  totalBuckets: number;

  /**
   * Creates a new set of candle options.
   *
   * @param {number} granularity - Size of a candle in seconds.
   * @param {Date} end - Final timestamp to end candle span, should be most recent.
   * @param {number} candlesPerBucket - Amount of candles to place in each bucket.
   * @param {number} totalBuckets - Total amount of buckets.
   */
  constructor(
    granularity: number,
    end: Date,
    candlesPerBucket: number,
    totalBuckets: number,
  ) {
    this.granularity = granularity;
    this.end = end;
    this.candlesPerBucket = candlesPerBucket;
    this.totalBuckets = totalBuckets;
  }

  /**
   * Length of a single bucket in milliseconds.
   */
  get bucketLengthMs(): number {
    return this.candlesPerBucket * this.granularity * 1000;
  }

  /**
   * Length of all buckets in milliseconds.
   */
  get totalLengthMs(): number {
    return this.totalCandleCount * this.granularity * 1000;
  }

  /**
   * Total amount of candles for all buckets.
   */
  get totalCandleCount(): number {
    return this.candlesPerBucket * this.totalBuckets;
  }

  /**
   * Size of a single candle in minutes.
   */
  get candleSizeMin(): number {
    return this.granularity / ONE_MINUTE_TO_S;
  }
}

/**
 * Obtains candles from a local database, then pull any new candles that are
 * not present from a remote API.
 *
 * @param {string} productId - Id of the product/pair to get candles for.
 * @param {CandleOpts} opts - Outlines what to pull from when.
 * @returns {Promise<{candles: SimpleCandle[]; loaded: number; pulled: number}>}
 */
export async function getCandles(
  productId: string,
  opts: CandleOpts,
): Promise<{candles: SimpleCandle[]; loaded: number; pulled: number}> {
  let loaded: number = 0;
  let pulled: number = 0;

  // Create a timespan for collecting the MAXIMUM amount of candles.
  let past = new Date(opts.end);
  past.setTime(past.getTime() - opts.totalLengthMs);
  let {start, end} = getSpan(past, opts.candleSizeMin, new Date(opts.end));
  const oldestTs = new Date(start).toISOString();

  // Try to get historic candles saved locally.
  let candles = CANDLES.get(productId) ?? [];
  if (!candles || candles.length === 0) {
    const candleData = await loadCandleData(productId);
    candles = candleData.candles;
  }

  if (candles.length > 0) {
    loaded = candles.length;
    // Adjust our start timestamp to the most recent candle obtained.
    const ts = candles[loaded - 1].openTimeInISO;
    start = new Date(ts);
  }

  let newCandles: SimpleCandle[] = [];
  // If at least one candle could be pulled, then attempt to get it from API.
  if ((end.getTime() - start.getTime()) / 1000 >= opts.granularity) {
    start.setTime(start.getTime() + 1000);
    const pulledCandles = await AnonymousClient.getCandles(
      productId,
      opts.granularity,
      end,
      start,
    );

    // Convert candles to SimpleCandle for storage and space reduction.
    for (const c of pulledCandles) newCandles.push(convert(c));
    pulled = newCandles.length;
    if (pulled > 0) {
      saveCandles(productId, newCandles, opts.totalCandleCount);
    }
  }

  // Clean the candle data.
  const cleanedCandles = cleanCandles(
    candles,
    newCandles,
    oldestTs,
    opts.totalCandleCount,
  );

  // Update CANDLE_DATA.
  CANDLES.set(productId, cleanedCandles);

  return {candles: cleanedCandles, loaded: loaded, pulled: pulled};
}

/**
 * Cleans CANDLES global by inserting new candles to the end of the array and
 * removing the older candles from the beginning. Also removes candles that are too
 * old to be used for processing.
 *
 * @param {SimpleCandle[]} oldCandles - Original candles in the array.
 * @param {SimpleCandle[]} newCandles - New candles to append.
 * @param {string} oldestTs - Oldest time a candle can be in the past.
 * @param {number} maxCandles - Total amount of candles allowed to be kept.
 * @returns {SimpleCandle[]} Newly cleaned, shifted, and concat'd array of candles.
 */
function cleanCandles(
  oldCandles: SimpleCandle[],
  newCandles: SimpleCandle[],
  oldestTs: string,
  maxCandles: number,
): SimpleCandle[] {
  // Convert and push new candles into old array.
  if (newCandles.length > 0) {
    oldCandles = oldCandles.concat(newCandles);

    // Shift the array.
    if (oldCandles.length > maxCandles && newCandles.length > 0) {
      oldCandles.splice(0, oldCandles.length - maxCandles);
    }
  }

  // Remove candles that are outdated (this is for arrays that haven't hit max.
  if (oldCandles.length > 0 && oldCandles[0].openTimeInISO <= oldestTs) {
    const index = oldCandles.findIndex((c) => c.openTimeInISO > oldestTs);
    if (index >= 0) oldCandles.splice(0, index);
  }

  return oldCandles;
}

/**
 * Appends candle data to database, creating product if it does not exist.
 *
 * @param {string} productId - Product/pair to update.
 * @param {SimpleCandle[]} data - Candles in array format to append.
 * @param {number} maxCount - Maximum amount of data to store in database.
 */
export async function saveCandles(
  productId: string,
  data: SimpleCandle[],
  maxCount: number,
) {
  await CandleDataModel.updateOne(
    {productId: productId, useSandbox: USE_SANDBOX},
    {$push: {candles: {$each: data, $slice: -maxCount}}},
    {upsert: true},
  );
}

/**
 * Loads all candle data from mongodb.
 *
 * @param {string} productId - Product/pair to get.
 * @returns {Promise<Record<string, SimpleCandle[]>>} Candle data for each product/pairs.
 */
export async function loadCandleData(productId: string): Promise<CandleData> {
  let data = (await CandleDataModel.findOne(
    {productId: productId, useSandbox: USE_SANDBOX},
    null,
    {
      lean: true,
    },
  )) as CandleData;

  if (!data) {
    data = {productId: productId, useSandbox: USE_SANDBOX, candles: []};
  }

  return data;
}

/**
 * Converts a candle from an API to a SimpleCandle which is more space friendly.
 *
 * @param {Candle} candle - Candle to convert.
 * @returns {SimpleCandle} Newly created candle without overhead.
 */
function convert(candle: Candle): SimpleCandle {
  return {
    open: candle.open,
    close: candle.close,
    high: candle.high,
    low: candle.low,
    volume: candle.volume,
    openTimeInISO: candle.openTimeInISO,
  };
}
