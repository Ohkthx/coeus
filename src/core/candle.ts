import {Candle} from 'coinbase-pro-node';
import {USE_SANDBOX} from '..';
import {AnonymousClient} from '../exchange-api/coinbase';
import {CandleData, CandleDataModel, SimpleCandle} from '../models/candle';
import {getSpan} from './timespan';

export const ONE_DAY_TO_S: number = 86400;
export const ONE_HOUR_TO_S: number = 3600;
export const ONE_MINUTE_TO_S: number = 60;

export const CANDLES = new Map<string, SimpleCandle[]>();

export class CandleOpts {
  granularity: number;
  end: Date;
  candlesPerBucket: number;
  totalBuckets: number;

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

  get bucketLengthMs(): number {
    return this.candlesPerBucket * this.granularity * 1000;
  }

  get totalLengthMs(): number {
    return this.totalCandleCount * this.granularity * 1000;
  }

  get totalCandleCount(): number {
    return this.candlesPerBucket * this.totalBuckets;
  }

  get candleSizeMin(): number {
    return this.granularity / ONE_MINUTE_TO_S;
  }
}

/**
 * Obtain candles from local database and fill in missing candles from API.
 *
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
 * @param {CandleData[]} data - Candles in array format to append.
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
 * @returns {Promise<Record<string, Candle[]>>} Candle data for each product/pairs.
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
