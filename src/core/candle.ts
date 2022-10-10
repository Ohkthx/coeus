import {Candle} from 'coinbase-pro-node';
import {
  GridFSBucket,
  GridFSBucketReadStream,
  GridFSBucketWriteStream,
  ObjectId,
} from 'mongodb';
import mongoose from 'mongoose';
import {coreErr} from '.';
import {AnonymousClient} from '../exchange-api/coinbase';
import {SimpleCandle} from '../models/candle';
import {DataOpts} from './opts';

/**
 * Convert from milliseconds to seconds. Mostly for easier reading.
 *
 * @param {number} msValue - Time in milliseconds to convert.
 * @returns {number} Value provided now in seconds.
 */
function msToSeconds(msValue: number): number {
  return msValue / 1000;
}

/**
 * Obtains candles from a local database, then pull any new candles that are
 * not present from a remote API.
 *
 * @param {string} productId - Id of the product/pair to get candles for.
 * @param {DataOpts} opts - Outlines what to pull from when.
 * @returns {Promise<{candles: SimpleCandle[]; loaded: number; pulled: number}>}
 */
export async function getCandles(
  productId: string,
  opts: DataOpts,
  startOverride?: Date,
): Promise<SimpleCandle[]> {
  if (!opts.candle.pullNew) return [];

  // Create a timespan for collecting the MAXIMUM amount of candles.
  let {start, end} = opts.span;
  if (startOverride) start = startOverride;

  let newCandles: SimpleCandle[] = [];
  const sTimeDiff = msToSeconds(end.getTime() - start.getTime());
  // If at least one candle could be pulled, then attempt to get it from API.
  if (sTimeDiff < opts.candle.sGranularity) return [];

  // Increase the time by a single second so that we pull
  // the entire most recent candle.
  start.setTime(start.getTime() + 1000);

  // Get the candles from the API.
  return AnonymousClient.getCandles(
    productId,
    opts.candle.sGranularity,
    end,
    start,
  )
    .then((pulledCandles) => {
      // Convert candles to SimpleCandle for storage and space reduction.
      for (const c of pulledCandles) newCandles.push(convert(c));
      return newCandles;
    })
    .catch((err) => {
      coreErr(`something happened: ${err}`);
      coreErr(`${start} => ${end}: ${new Date().toISOString()}`);
      coreErr(err);
      return [];
    });
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
export function combineCandles(
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
