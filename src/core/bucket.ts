import {std} from 'mathjs';
import {coreErr} from '.';
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
 * @param {SimpleCandle[]} candles - Candles to split and group.
 * @param {CandleOpts} opts - Options on how to pull and process candle data.
 * @returns {BucketData[]} Newly created buckets of candle data, oldest to newest.
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

  // Preprocessing: Create the spans and empty buckets to place candles in.
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
      coreErr(`Ran out of spans for candles.`);
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
      // Remove all buckets that will not have candle data.
      spans.splice(0, index);
      bucketPos += index;
    }

    if (spans.length === 0) {
      coreErr(`Ran out of spans for candles.`);
      break;
    }
  }

  // Convert the candles in the buckets into usable compiled data.
  const data = processor(buckets.reverse());
  data.sort((a, b) => (a.timestampISO < b.timestampISO ? -1 : 1));
  return data;
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
      avg: -1,
      low: -1,
      high: -1,
      close: -1,
    },
    lastCandle: {
      close: -1,
      low: -1,
      high: -1,
      volume: 0,
    },
    deviation: {
      close: 0,
      volume: 0,
    },
  };
}

/**
 * Processes the candles in the buckets into tangible data.
 *
 * @param {CandleBucket[]} candleBuckets - Buckets of candles to process.
 * @returns {BuketData[]} Compiled data from buckets.
 */
function processor(candleBuckets: CandleBucket[]): BucketData[] {
  const buckets: BucketData[] = [];
  for (let i = 0; i < candleBuckets.length; i++) {
    const {timestampISO, candles} = candleBuckets[i];

    // Ignore empty buckets.
    if (candles.length === 0) continue;

    let data: BucketData = newBucketData(timestampISO);

    // Get the high, low, close, and total volume for the bucket.
    let totalClose = 0;
    for (const c of candles) {
      if (c.high > data.price.high) data.price.high = c.high;
      if (data.price.low < 0 || c.low < data.price.low) data.price.low = c.low;
      totalClose += c.close;
      data.volume += c.volume;
    }

    // Amount of data (candles) that made the data.
    data.dataPoints = candles.length;

    // Computes avg for whole bucket and store last candle data.
    data.price.avg = totalClose / data.dataPoints;
    data.price.close = candles[0].close;
    data.lastCandle.close = candles[0].close;
    data.lastCandle.low = candles[0].low;
    data.lastCandle.high = candles[0].high;
    data.lastCandle.volume = candles[0].volume;

    // Compute the standard deviations.
    data.deviation.close = std(...candles.map((c) => c.close));
    data.deviation.volume = std(...candles.map((c) => c.volume));

    buckets.push(data);
  }

  return buckets;
}
