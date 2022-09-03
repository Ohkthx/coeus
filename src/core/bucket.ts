import {Candle} from 'coinbase-pro-node';
import {std} from 'mathjs';
import {SimpleCandle} from '../models/candle';
import {CandleOpts} from './candle';
import {createSpan, getSpan, Timespan} from './timespan';

interface CandleBucket {
  timestampISO: string;
  candles: SimpleCandle[];
}

export interface ProductData {
  productId: string;
  useSandbox: boolean;
  bucketData: BucketData[];
}

export interface BucketData {
  timestampISO: string;
  dataPoints: number;
  volume: number;
  price: {
    avg: number;
    low: number;
    high: number;
    close: number;
  };
  lastCandle: {
    close: number;
    low: number;
    high: number;
    volume: number;
  };
  deviation: {
    close: number;
    volume: number;
  };
}

/**
 * Bundles candles into buckets, which are just groups of candles.
 *
 * @param {Candle[]} candles - Candles to process.
 * @param {CandleOpts} opts - Options on how to pull and process candle data.
 * @returns {BucketData[]} Newly created buckets of candle data.
 */
export function createBuckets(
  candles: SimpleCandle[],
  opts: CandleOpts,
): BucketData[] {
  // Create a timespan for the first bucket to get resized.
  let past = new Date(opts.end);
  past.setTime(past.getTime() - opts.bucketLengthMs);
  let {start, end} = getSpan(past, opts.candleSizeMin, new Date(opts.end));

  const spans: Timespan[] = [];
  const buckets: CandleBucket[] = [];

  // Create the spans and empty buckets to place candles in.
  for (let i = opts.totalBuckets; i > 0; i--) {
    const span = createSpan(start.toISOString(), end.toISOString());
    spans.push(span);
    buckets.push({timestampISO: end.toISOString(), candles: []});

    end = new Date(start);
    start.setTime(start.getTime() - opts.bucketLengthMs);
  }

  // Process each candle, and place it in the correct bucket based on timestamp.
  //   Candles are placed NEWEST => OLDEST
  let bucketPos = 0;
  for (let i = candles.length - 1; i >= 0; i--) {
    const candle = candles[i];

    if (spans.length === 0) {
      console.log(`\n RAN OUT OF SPANS FOR CANDLES.`);
      break;
    }

    // Place the candle into the bucket.
    if (candle.openTimeInISO > spans[0].start.toISOString()) {
      buckets[bucketPos].candles.push(candle);
      continue;
    }

    // Candle did not fit, attempt to find the correct bucket to place it.
    const index = spans.findIndex(
      (s) => s.start.toISOString() < candle.openTimeInISO,
    );
    if (index >= 0) {
      //console.log(`    found at index: ${index}, value: ${buckets[index]}`)
      spans.splice(0, index);
      bucketPos += index;
    }

    if (spans.length === 0) {
      console.log(`\n RAN OUT OF SPANS FOR CANDLES.`);
      break;
    }
  }

  // Convert the candles in the buckets into usable compiled data.
  const data = processor(buckets.reverse());
  data.sort((a, b) => (a.timestampISO < b.timestampISO ? -1 : 1));
  return data;
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
    dataPoints: 0,
    volume: 0,
    price: {
      avg: 0,
      low: 0,
      high: 0,
      close: 0,
    },
    lastCandle: {
      close: 0,
      low: 0,
      high: 0,
      volume: 0,
    },
    deviation: {
      close: 0,
      volume: 0,
    },
  };
}

/**
 * Get the average amount of buckets for all products/pairs.
 *
 * @param {Record<string, BucketData[]>} data - Data to compute averages from.
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
  for (let i = 0; i < candleBuckets.length; i++) {
    const candleBucket = candleBuckets[i];

    //Attempt to replace any missing buckets with candle data from another.
    if (candleBucket.candles.length === 0) {
      if (i == 0) continue;
      for (let j = i - 1; j >= 0; j--) {
        if (candleBuckets[j].candles.length > 0) {
          candleBucket.candles = candleBuckets[j].candles;
        }
      }

      // TODO: Throw an error? Did not find a replacement.
      if (candleBucket.candles.length === 0) continue;
    }

    let data: BucketData = newBucketData(candleBucket.timestampISO);

    let high = 0;
    let low = -1;
    let totalClose = 0;
    let totalVolume = 0;
    for (const c of candleBucket.candles) {
      if (c.high > high) high = c.high;
      if (low < 0 || c.low < low) low = c.low;
      totalClose += c.close;
      totalVolume += c.volume;
    }

    data.dataPoints = candleBucket.candles.length;
    // total volume, low, and high.
    data.volume = totalVolume;
    data.price.avg = totalClose / data.dataPoints;
    data.price.low = low;
    data.price.high = high;
    data.price.close = candleBucket.candles[0].close;
    data.lastCandle.close = candleBucket.candles[0].close;
    data.lastCandle.low = candleBucket.candles[0].low;
    data.lastCandle.high = candleBucket.candles[0].high;
    data.lastCandle.volume = candleBucket.candles[0].volume;

    data.deviation.close = getCloseStd(candleBucket.candles);
    data.deviation.volume = getVolumeStd(candleBucket.candles);

    buckets.push(data);
  }

  return buckets;
}

function getCloseStd(candles: SimpleCandle[]): number {
  const values = [];
  for (const c of candles) {
    values.push(c.close);
  }

  return std(...values);
}

function getDiffStd(candles: SimpleCandle[]): number {
  const values = [];
  for (const c of candles) {
    const change = Math.abs(c.high - c.low);
    values.push(change);
  }

  return std(...values);
}

function getVolumeStd(candles: SimpleCandle[]): number {
  const values = [];
  for (const c of candles) {
    values.push(c.volume);
  }

  return std(...values);
}

function getStd(candles: SimpleCandle[]): {
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
