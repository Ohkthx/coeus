import {Candle} from 'coinbase-pro-node';
import {mean, std} from 'mathjs';
import {dynamicWarn} from '.';
import {USE_SANDBOX} from '..';
import {ProductDataModel} from '../models';

interface CandleBucket {
  timestampISO: string;
  candles: Candle[];
}

export interface ProductData {
  productId: string;
  useSandbox: boolean;
  bucketData: BucketData[];
}

export interface BucketData {
  timestampISO: string;
  priceAvg: number;
  priceLow: number;
  priceHigh: number;
  priceClose: number;
  volume: number;
  closeStd: number;
  diffStd: number;
  volumeStd: number;
}

/**
 * Creates buckets of candles from preexisting candle data.
 *
 * @param {Candle[]} candles - Array of candles to bundle into buckets.
 * @param {number} candleSize - Size/length of candles in MINUTES.
 * @param {number} bucketSize - Amount of candles per bucket.
 * @param {number} lengthMs - Total time for all candles combined in MILLISECONDS(ms).
 * @returns {CandleBucket[]} Buckets of candles.
 */
export function createBuckets(
  candles: Candle[],
  candleSize: number,
  bucketSize: number,
  lengthMs: number,
): {buckets: BucketData[]; missing: number} {
  const candleBuckets: CandleBucket[] = [];
  let bucket: CandleBucket | undefined;

  for (let i = candles.length - 1; i >= 0; i--) {
    const candle = candles[i];
    // Modify the minutes to reflect the close instead of open.
    const cDateMin = new Date(candle.openTimeInISO).getMinutes() + candleSize;

    // Create the bucket if the minutes time is correct.
    if (cDateMin % (candleSize * bucketSize) === 0) {
      // Push the candleBucket into the buckets if it is the proper length.
      if (bucket?.candles.length === bucketSize) {
        candleBuckets.push(bucket);
      }

      // Offset the time of the bucket to be appropriate for the time span.
      const bucketDate = new Date(candles[i].openTimeInISO);
      bucketDate.setMinutes(bucketDate.getMinutes() + candleSize);

      // Create a new bucket.
      bucket = {timestampISO: bucketDate.toISOString(), candles: [candle]};
      continue;
    }

    if (!bucket) continue;

    // Match the candles minutes to the proper place in the array.
    if (cDateMin % bucketSize === bucket.candles.length) {
      // Push the candle into the bucket.
      bucket.candles.push(candles[i]);
    }
  }

  // Add the last bucket if it isn't already added.
  let cbLength = candleBuckets.length;
  if (bucket && bucket.candles.length === bucketSize) {
    const lastBucket = candleBuckets[cbLength - 1];
    if (!lastBucket) {
      candleBuckets.push(bucket);
      cbLength++;
    } else if (lastBucket.timestampISO !== bucket.timestampISO) {
      candleBuckets.push(bucket);
      cbLength++;
    }
  }

  // Check the amount of buckets created versus what was expected.
  const expectedCount = lengthMs / 1000 / 60 / candleSize / bucketSize;
  let missing = expectedCount - cbLength;
  if (missing < 0) {
    dynamicWarn(`unsure how missing is negative value: ${missing}`);
    missing = 0;
  }

  const buckets = processor(candleBuckets);
  return {buckets: buckets.reverse(), missing: missing};
}

/**
 * Gets the estimated amount of buckets within a given period.
 *
 * @param {number} periodSpan - Span of time in DAYS to calculate from.
 * @param {number} granularity - Length of individual items in SECONDS.
 * @param {number} bucketSize - Size of individual increments within span.
 * @returns {number} Amount of items that should exist.
 */
export function periodBucketCount(
  periodSpan: number,
  granularity: number,
  bucketSize: number,
): number {
  const lengthSec = periodSpan * 24 * 60 * 60;
  return lengthSec / granularity / bucketSize;
}

/**
 * Creates a blank bucket data, used to store information.
 *
 * @param {string} timestamp - Timestamp to assign to the bucket data.
 * @returns {BucketData} An empty bucket data with only timestamp assigned.
 */
export function newBucketData(timestamp: string): BucketData {
  return {
    timestampISO: timestamp,
    priceAvg: 0,
    priceLow: 0,
    priceHigh: 0,
    priceClose: 0,
    volume: 0,
    closeStd: 0,
    diffStd: 0,
    volumeStd: 0,
  };
}

/**
 * Appends bucket data to database, creating product if it does not exist.
 *
 * @param {string} productId - Product/pair to update.
 * @param {BucketData[]} data - Bucket data in array format to append.
 * @param {number} maxCount - Maximum amount of data to store in database.
 */
export async function saveBucketData(
  productId: string,
  data: BucketData[],
  maxCount: number,
) {
  await ProductDataModel.updateOne(
    {productId: productId, useSandbox: USE_SANDBOX},
    {$push: {bucketData: {$each: data, $slice: -maxCount}}},
    {upsert: true},
  );
}

/**
 * Loads all bucket data from mongodb.
 *
 * @returns {Promise<Record<string, BucketData[]>>} Bucket data for each product/pairs.
 */
export async function loadBucketData(): Promise<Record<string, BucketData[]>> {
  const data: Record<string, BucketData[]> = {};

  const products = await ProductDataModel.find(
    {useSandbox: USE_SANDBOX},
    null,
    {lean: true},
  );
  for (const p of products) {
    data[p.productId] = p.bucketData;
  }

  return data;
}

/**
 * Get the average amount of buckets for all products/pairs.
 *
 * @param {Record<string, BucketData[]>} Data to compute averages from.
 * @returns {number} Average per product/pair.
 */
export function getAvgBuckets(data: Record<string, BucketData[]>): number {
  let count = 0;

  let products = 0;
  for (const pId in data) {
    products++;
    count += data[pId].length;
  }

  return count / products;
}

function processor(candleBuckets: CandleBucket[]): BucketData[] {
  const buckets: BucketData[] = [];
  for (const candleBucket of candleBuckets) {
    let data: BucketData = newBucketData(candleBucket.timestampISO);

    // 60 minute information.
    let candles = candleBucket.candles;
    let candleData = getStd(candles);
    data.closeStd = candleData.close;
    data.diffStd = candleData.diff;
    data.volumeStd = candleData.volume;

    // total volume, low, and high.
    data.volume = getTotalVolume(candles);
    data.priceAvg = getCloseAvg(candles);
    data.priceLow = getPriceLow(candles);
    data.priceHigh = getPriceHigh(candles);
    data.priceClose = candles[candles.length - 1].close;

    buckets.push(data);
  }

  return buckets;
}

function getCloseAvg(candles: Candle[]): number {
  const prices: number[] = candles.map((c) => {
    return c.close;
  });
  return mean(prices);
}

function getPriceLow(candles: Candle[]): number {
  return candles.reduce((a, b) => (a.low < b.low ? a : b)).low;
}

function getPriceHigh(candles: Candle[]): number {
  return candles.reduce((a, b) => (a.high > b.high ? a : b)).high;
}

function getCloseStd(candles: Candle[]): number {
  const values = [];
  for (const c of candles) {
    values.push(c.close);
  }

  return std(...values);
}

function getDiffStd(candles: Candle[]): number {
  const values = [];
  for (const c of candles) {
    const change = Math.abs(c.high - c.low);
    values.push(change);
  }

  return std(...values);
}

function getVolumeStd(candles: Candle[]): number {
  const values = [];
  for (const c of candles) {
    values.push(c.volume);
  }

  return std(...values);
}

function getTotalVolume(candles: Candle[]): number {
  return candles.reduce((a, b) => {
    return a + b.volume;
  }, 0);
}

function getStd(candles: Candle[]): {
  close: number;
  diff: number;
  volume: number;
} {
  return {
    close: getCloseStd(candles),
    diff: getDiffStd(candles),
    volume: getVolumeStd(candles),
  };
}
