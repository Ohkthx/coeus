import {std} from 'mathjs';
import {coreErr} from '.';
import {SimpleCandle} from '../models/candle';
import {DataOpts} from './opts';
import {createSpan, getSpan, Timespan} from '../timespan';

interface CandleBucket {
  timestampISO: string;
  candles: SimpleCandle[];
}

export interface CascadeOptions {
  offset: number;
  amountPer: number;
  maxSize: number;
}

export interface ProductData {
  productId: string;
  useSandbox: boolean;
  bucketData: BucketData[];
}

export interface BucketData {
  timestampISO: string;
  dataPoints: number;
  price: {
    closeAvg: number;
    diffAvg: number;
    low: number;
    high: number;
    close: number;
    cv: number;
  };
  volume: {
    total: number;
    avg: number;
    cv: number;
  };
  lastCandle: {
    close: number;
    low: number;
    high: number;
    volume: number;
  };
}

/**
 * Bundles candles into buckets, which are just groups of candles.
 *
 * @param {SimpleCandle[]} candles - Candles to split and group.
 * @param {DataOpts} opts - Options on how to pull and process candle data.
 * @returns {CandleData[]} Newly created buckets of candles NEWEST to OLDEST.
 */
function createCandleBuckets(
  candles: SimpleCandle[],
  opts: DataOpts,
): CandleBucket[] {
  // Create a timespan for the first bucket to get resized.
  let past = new Date(opts.end);
  past.setTime(past.getTime() - opts.bucketLengthMs);
  let {start, end} = getSpan(past, opts.candleSizeMin, new Date(opts.end));

  const spans: Timespan[] = [];
  const buckets: CandleBucket[] = [];

  // Preprocessing: Create the spans and empty buckets to place candles in.
  for (let i = opts.bucket.total; i > 0; i--) {
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

  return buckets;
}

export function createBucketData(
  candles: SimpleCandle[],
  opts: DataOpts,
  cascadeOpts?: CascadeOptions,
): BucketData[] {
  // Create the candle buckets. Obtained are NEWEST to OLDEST.
  let buckets = createCandleBuckets(candles, opts);

  // If it is cascaded, take the buckets and combine  with an offset.
  if (cascadeOpts && cascadeOpts.offset > 0) {
    const newBuckets: CandleBucket[] = [];

    // Iterate and create each new bucket till maxSize.
    for (let i = 0; i < cascadeOpts.maxSize; i++) {
      let values: SimpleCandle[] = [];
      if (buckets.length === 0) break;

      // Iterate the buckets, saving the data if required.
      for (let j = 0; j < buckets.length; j++) {
        if (j > 0 && j % cascadeOpts.amountPer === 0) break;
        values = values.concat(buckets[j].candles);
      }

      if (values.length === 0) continue;
      buckets.splice(0, cascadeOpts.offset);

      newBuckets.push({timestampISO: values[0].openTimeInISO, candles: values});
    }

    // Set the buckets to the newly formed cascaded version.
    buckets = newBuckets;
  }

  // Convert the candles in the buckets into usable compiled data.
  //   Going in REVERSE so that it is OLDEST to NEWEST.
  const data = candleProcessor(buckets.reverse());
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
    price: {
      closeAvg: -1,
      diffAvg: -1,
      low: -1,
      high: -1,
      close: -1,
      cv: -1,
    },
    volume: {
      total: 0,
      avg: 0,
      cv: -1,
    },
    lastCandle: {
      close: -1,
      low: -1,
      high: -1,
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
function candleProcessor(candleBuckets: CandleBucket[]): BucketData[] {
  const buckets: BucketData[] = [];
  for (let i = 0; i < candleBuckets.length; i++) {
    const {timestampISO, candles} = candleBuckets[i];

    // Ignore empty buckets.
    if (candles.length === 0) continue;

    let data: BucketData = newBucketData(timestampISO);

    // Get the high, low, close, and total volume for the bucket.
    let totalClose = 0;
    let totalVolume = 0;
    let totalDiff = 0;
    for (const c of candles) {
      if (c.high > data.price.high) data.price.high = c.high;
      if (data.price.low < 0 || c.low < data.price.low) data.price.low = c.low;
      totalDiff += c.high - c.low;
      totalClose += c.close;
      totalVolume += c.volume;
    }

    // Amount of data (candles) that made the data.
    data.dataPoints = candles.length;

    // Computes avg for whole bucket and store last candle data.
    data.price.diffAvg = totalDiff / data.dataPoints;
    data.price.closeAvg = totalClose / data.dataPoints;
    data.price.close = candles[0].close;
    data.volume.avg = totalVolume / data.dataPoints;
    data.volume.total = totalVolume;
    data.lastCandle.close = candles[0].close;
    data.lastCandle.low = candles[0].low;
    data.lastCandle.high = candles[0].high;
    data.lastCandle.volume = candles[0].volume;

    // Compute the coefficient of variances.
    data.price.cv = std(...candles.map((c) => c.close)) / data.price.closeAvg;
    data.volume.cv = std(...candles.map((c) => c.volume)) / data.volume.avg;

    buckets.push(data);
  }

  return buckets;
}
