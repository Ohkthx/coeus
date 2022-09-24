import {multiply, sum} from 'mathjs';
import {CLOSE_WEIGHT, DIFF_WEIGHT, VOLUME_WEIGHT} from '.';
import {toFixed} from '../product';
import {toFixed as quickFix} from '../utils';
import {BucketData} from './bucket';
import {getLastMA, Indicators, MASet} from './indicators';

export interface SortFilter {
  count?: number;
  movement?: boolean;
  close?: boolean;
  diff?: boolean;
  volume?: boolean;
}

export interface ProductRanking {
  productId: string;
  ranking: number;
  dataPoints: number;
  movement: number;
  indicators: Indicators;
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

export const UNSET_MA_SET: MASet = {sma: {}, ema: {}};

/**
 * Sorts rankings based on a filter provided. Rankings are returned from greatest
 * rating to worst rating.
 *
 * @param {ProductRanking[]} rankings - Product rankings to process.
 * @param {SortFilter} filter - The filter to be applied to the rankings.
 * @returns {ProductRanking[]} Filtered and sorted rankings.
 */
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
  if (filter.count && filter.count > 0) s = s.slice(0, filter.count);

  for (let i = 0; i < s.length; i++) s[i].ranking = i + 1;
  return s;
}

/**
 * Convert Bucket Data into an actual ranking.
 *
 * @param {string} productId - Product/pair to process.
 * @param {BucketData[]} data - Bucket data to process and compile into a ranking.
 * @param {Indicators} indicators - Groups of indicator data to add to ranking..
 * @param {number} movement - Buying/Selling ratio to add to ranking.
 * @returns {ProductRanking | undefined} Ranking of the product, if no errors.
 */
export function makeRanking(
  productId: string,
  data: BucketData[],
  indicators: Indicators,
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
    indicators: indicators,
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
