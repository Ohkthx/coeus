import {mean, multiply, sum} from 'mathjs';
import {CLOSE_WEIGHT, DIFF_WEIGHT, VOLUME_WEIGHT} from '.';
import {toFixed} from '../product';
import {toFixed as quickFix} from '../utils';
import {BucketData} from './bucket';

export interface SortFilter {
  count: number;
  movement?: boolean;
  close?: boolean;
  diff?: boolean;
  volume?: boolean;
}

export interface MAValues {
  twelve: number;
  twentysix: number;
  fifty: number;
  twohundred: number;
}

export interface DayMA {
  sma: MAValues;
  ema: MAValues;
}

export interface ProductRanking extends DayMA {
  productId: string;
  ranking: number;
  dataPoints: number;
  movement: number;
  ratio: {
    rating: number;
    close: number;
    diff: number;
    volume: number;
  };
  last: {
    volume: number;
    volumeAvg: number;
    close: number;
    closeAvg: number;
    high: number;
    low: number;
    cov: {
      close: number;
      volume: number;
    };
  };
}

export const UNSET_DAY_MA: DayMA = {
  sma: {
    twelve: -1,
    twentysix: -1,
    fifty: -1,
    twohundred: -1,
  },
  ema: {
    twelve: -1,
    twentysix: -1,
    fifty: -1,
    twohundred: -1,
  },
};

export function sortRankings(
  rankings: ProductRanking[],
  filter: SortFilter,
): ProductRanking[] {
  let s: ProductRanking[] = [...rankings];
  if (filter.close) s = s.filter((r) => r.ratio.close > 1);
  if (filter.diff) s = s.filter((r) => r.ratio.diff > 1);
  if (filter.volume) s = s.filter((r) => r.ratio.volume > 1);
  if (filter.movement) s = s.filter((r) => r.movement > 1);

  s.sort((a, b) => (a.ratio.rating > b.ratio.rating ? -1 : 1));
  if (filter.count > 0) s = s.slice(0, filter.count);

  for (let i = 0; i < s.length; i++) s[i].ranking = i + 1;
  return s;
}

/**
 * Convert Bucket Data into an actual ranking.
 *
 * @param {string} productId - Product/pair to process.
 * @param {BucketData[]} data - Bucket data to process and compile into a ranking.
 * @returns {ProductRanking} Ranking of the product provided.
 */
export function makeRanking(
  productId: string,
  data: BucketData[],
  dayMA: DayMA,
  movement: number,
): ProductRanking | undefined {
  if (data.length === 0) return;

  const dataPoints = sum(data.map((d) => d.dataPoints));
  const last = data[data.length - 1];

  // Calculate the ratios from last candles data.
  const closeRatio = last.lastCandle.close / last.price.closeAvg;
  const volumeRatio = last.lastCandle.volume / last.volume.avg;
  const diffRatio =
    (last.lastCandle.high - last.lastCandle.low) / last.price.diffAvg;

  // Factor in the weights to create a rating.
  const rating: number =
    multiply(closeRatio, CLOSE_WEIGHT) +
    multiply(volumeRatio, VOLUME_WEIGHT) +
    multiply(diffRatio, DIFF_WEIGHT);

  return {
    productId: productId,
    ranking: -1,
    dataPoints: dataPoints,
    movement: quickFix(movement, 4),
    ratio: {
      rating: quickFix(rating, 4),
      close: quickFix(closeRatio, 4),
      diff: quickFix(diffRatio, 4),
      volume: quickFix(volumeRatio, 4),
    },
    sma: dayMA.sma,
    ema: dayMA.ema,
    last: {
      volume: toFixed(productId, last.volume.total),
      volumeAvg: toFixed(productId, last.volume.avg),
      close: last.price.close,
      closeAvg: toFixed(productId, last.price.closeAvg, 'quote'),
      high: last.price.high,
      low: last.price.low,
      cov: {
        close: quickFix(last.price.cv, 4),
        volume: quickFix(last.volume.cv, 4),
      },
    },
  };
}

/**
 * 'k' value for calculating EMA.
 *
 * @param {number} mRange - Amount of days to smooth over.
 * @returns {number} Smoothing 'k' value.
 */
function smooth(mRange: number): number {
  return 2 / (mRange + 1);
}

/**
 * Calculates the EMA from provided closes over a range of time.
 *
 * @param {number[]} closes - Closes over each day.
 * @param {number} mRange - Amount of days to smooth over.
 * @returns {number[]} EMA for each data point calculated. Last is most recent.
 */
export function ema(closes: number[], mRange: number): number[] {
  if (closes.length < mRange) return [];

  const k = smooth(mRange);
  const sma = mean(closes.slice(0, mRange));
  let value = sma;

  const emas: number[] = [sma];
  for (let i = mRange; i < closes.length; i++) {
    value = k * closes[i] + (1 - k) * value;
    emas.push(value);
  }

  return emas;
}

/**
 * Calculate the SMA from the provided closes over a range of time.
 *
 * @param {number[]} closes - Closes over each day.
 * @param {number} mRange - Amount of days to calculate the SMA on.
 * @returns {number[]} SMA for each data point calculated. Last is most recent.
 */
export function sma(closes: number[], mRange: number): number[] {
  if (closes.length < mRange) return [];

  const smas: number[] = [];
  for (let i = 0; i < closes.length - mRange + 1; i++) {
    const value = mean(closes.slice(i, i + mRange));
    smas.push(value);
  }

  return smas;
}
