import {multiply, sum} from 'mathjs';
import {CLOSE_WEIGHT, DIFF_WEIGHT, dynamicErr, VOLUME_WEIGHT} from '.';
import {ema, sma} from '../exchange-api/coinbase';
import {toFixed} from '../product';
import {toFixed as quickFix} from '../utils';
import {BucketData} from './bucket';

export interface ProductRanking {
  productId: string;
  ranking: number;
  dataPoints: number;
  sma: {
    twelve: number;
    twentysix: number;
    fifty: number;
    twohundred: number;
  };
  ema: {
    twelve: number;
    twentysix: number;
    fifty: number;
    twohundred: number;
  };
  rating: {
    value: number;
    close: number;
    diff: number;
    volume: number;
  };
  last: {
    volume: number;
    close: number;
    high: number;
    low: number;
    avg: number;
  };
}

/**
 * Sorts each product ranking based on the rating,
 * keeping the top selected.
 *
 * @param {ProductRanking[]} rankings - Product rankings to process.
 * @param {number} keep - Top ranking data to keep.
 */
export function sortRankings(rankings: ProductRanking[], keep: number) {
  let sortedRankings: ProductRanking[] = rankings;
  sortedRankings.sort((a, b) => (a.rating > b.rating ? -1 : 1));
  if (keep > 0) sortedRankings = rankings.slice(0, keep);
  return sortedRankings;
}

/**
 * Creates rankings from intervals provided.
 *
 * @returns {ProductRanking[]} Rankings of all products, sorted.
 */
export function makeRankings(
  productData: Map<string, BucketData[]>,
): ProductRanking[] {
  const rankings: ProductRanking[] = [];

  for (const pId of productData.keys()) {
    const data = productData.get(pId) ?? [];

    if (data.length === 0) continue;

    // Create rankings for each common interval.
    try {
      const rank = makeRanking(pId, data);
      rankings.push(rank);
    } catch (err) {
      let errMsg = 'unknown error';
      if (err instanceof Error) errMsg = err.message;
      dynamicErr(errMsg);
    }
  }

  // Sort the rankings based on their current rating values.
  rankings.sort((a, b) => (a.rating.value > b.rating.value ? -1 : 1));
  for (let i = 0; i < rankings.length; i++) rankings[i].ranking = i + 1;

  return rankings;
}

/**
 * Convert Interval Data into an actual ranking.
 */
function makeRanking(productId: string, data: BucketData[]): ProductRanking {
  const dataPoints = sum(data.map((d) => d.dataPoints));
  const closes = data.map((d) => d.price.close);

  //const closeAvg = mean(closes);
  //const volumeAvg = mean(data.map((d) => d.volume));
  //const diffAvg = mean(data.map((d) => d.price.high - d.price.low));

  const last = data[data.length - 1];
  const closeRatio = last.lastCandle.close / last.price.avg;
  const volumeRatio = last.lastCandle.volume / (last.volume / last.dataPoints);
  const diffRatio =
    (last.lastCandle.high - last.lastCandle.low) /
    (last.price.high - last.price.low);

  // Factor in the weights to create a rating.
  const rating: number =
    multiply(closeRatio, CLOSE_WEIGHT) +
    multiply(volumeRatio, VOLUME_WEIGHT) +
    multiply(diffRatio, DIFF_WEIGHT);

  const lastValue = (values: number[]): number => {
    if (values.length === 0) return -1;
    return values[values.length - 1];
  };

  // Get the SMAs
  const sma1 = sma(closes, 12);
  const sma2 = sma(closes, 26);
  const sma3 = sma(closes, 50);
  const sma4 = sma(closes, 200);

  // Get the EMAs
  const ema1 = ema(closes, 12);
  const ema2 = ema(closes, 26);
  const ema3 = ema(closes, 50);
  const ema4 = ema(closes, 200);

  return {
    productId: productId,
    ranking: -1,
    dataPoints: dataPoints,
    sma: {
      twelve: toFixed(productId, lastValue(sma1), 'quote'),
      twentysix: toFixed(productId, lastValue(sma2), 'quote'),
      fifty: toFixed(productId, lastValue(sma3), 'quote'),
      twohundred: toFixed(productId, lastValue(sma4), 'quote'),
    },
    ema: {
      twelve: toFixed(productId, lastValue(ema1), 'quote'),
      twentysix: toFixed(productId, lastValue(ema2), 'quote'),
      fifty: toFixed(productId, lastValue(ema3), 'quote'),
      twohundred: toFixed(productId, lastValue(ema4), 'quote'),
    },
    rating: {
      value: quickFix(rating, 4),
      close: quickFix(closeRatio, 4),
      diff: quickFix(diffRatio, 4),
      volume: quickFix(volumeRatio, 4),
    },
    last: {
      volume: toFixed(productId, last.volume),
      close: last.price.close,
      high: last.price.high,
      low: last.price.low,
      avg: toFixed(productId, last.price.avg, 'quote'),
    },
  };
}
