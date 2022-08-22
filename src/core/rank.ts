import {abs, mean, sum} from 'mathjs';
import {dynamicDebug, dynamicErr} from '.';
import {APP_DEBUG} from '..';
import {AnonymousClient, getEMA} from '../exchange-api/coinbase';
import {toFixed as fix} from '../product';
import {toFixed} from '../utils';
import {IntervalData} from './interval';

export interface ProductRanking {
  productId: string;
  ranking: number;
  score: number;
  ema7: number;
  ema14: number;
  dataPoints: number;
  last: {
    movement: number;
    close: number;
    stdClose: number;
    diff: number;
    stdDiff: number;
  };
  rating: {
    value: number;
    close: number;
    diff: number;
    volume: number;
  };
}

/**
 * Sorts each interval data in each interval based on the rating,
 * keeping the top selected.
 *
 * @param {IntervalData[][]} intervals - Intervals to process.
 * @param {number} keep - Top interval data to keep.
 */
export function sortIntervals(intervals: IntervalData[][], keep: number) {
  for (let i = 0; i < intervals.length; i++) {
    let data = intervals[i];
    data.sort((a, b) => (a.rating > b.rating ? -1 : 1));
    intervals[i] = data.slice(0, keep);
  }
}

/**
 * Creates rankings from intervals provided.
 *
 * @param {IntervalData[][]} intervals - Intervals to process.
 * @param {string} endISO - Ending timestamp for EMA calculation.
 * @returns {Promise<ProductRanking[]>} Rankings of all products, sorted.
 */
export async function makeRankings(
  intervals: IntervalData[][],
  endISO: string,
): Promise<ProductRanking[]> {
  const rankings: ProductRanking[] = [];

  // Get the common interval data that is persistent over multiple intervals.
  const intersection = intersectMany(...intervals);

  let i: number = 0;
  for (const pId of intersection.keys()) {
    if (APP_DEBUG) {
      const maxLen = intersection.size.toString();
      const pad = maxLen.length;
      const value: string = `${(++i).toString().padEnd(pad)}`;
      const counter = `${value} / ${maxLen.padEnd(pad)}`;
      dynamicDebug(`[${counter}] creating ranking for '${pId}'.`, '\r');
    }

    const data = intersection.get(pId) ?? [];

    // Create rankings for each common interval.
    const rank = await makeRanking(pId, endISO, 0, data);
    rankings.push(rank);
  }

  // Sort the rankings based on their current rating values.
  return rankings.sort((a, b) => (a.rating.value > b.rating.value ? -1 : 1));
}

/**
 * Convert Interval Data into an actual ranking.
 */
async function makeRanking(
  productId: string,
  endISO: string,
  rank: number,
  data: IntervalData[],
): Promise<ProductRanking> {
  const ratings: number[] = data.map((s) => s.rating);
  const rating: number = mean(ratings);

  const closes: number[] = data.map((s) => s.close);
  const closeVal: number = mean(closes);

  const diffs: number[] = data.map((s) => s.diff);
  const diffVal: number = mean(diffs);

  const volumes: number[] = data.map((s) => s.volume);
  const volumeVal: number = mean(volumes);

  const dataPoints: number[] = data.map((s) => s.data.length);
  const dataPointVal: number = sum(dataPoints);

  const lastIntervalData: IntervalData = data[data.length - 1];
  const lastDataEntry = lastIntervalData.data.lastEntry;

  const lastClose = lastDataEntry.priceClose;
  const lastDiff = abs(lastDataEntry.priceHigh - lastDataEntry.priceLow);
  const lastStdClose = lastDataEntry.closeStd;
  const lastStdDiff = lastDataEntry.diffStd;

  // Get the movement based on current active orders.
  const orderCounts = await AnonymousClient.getOrderCount(productId);
  const movement = orderCounts.buys / orderCounts.sells;

  // Create the EMAs, -1 indicates an error.
  let ema7 = -1;
  let ema14 = -1;
  try {
    ema7 = await getEMA(productId, 7, endISO);
    ema14 = await getEMA(productId, 14, endISO);
  } catch (err) {
    if (err instanceof Error) dynamicErr(err.message);
    else {
      dynamicErr(`odd error... ${err}`);
    }
  }

  return {
    productId: productId,
    ranking: rank,
    score: 0,
    ema7: fix(productId, ema7, 'quote'),
    ema14: fix(productId, ema14, 'quote'),
    dataPoints: dataPointVal,
    last: {
      movement: toFixed(movement, 4),
      close: lastClose,
      stdClose: lastStdClose,
      diff: lastDiff,
      stdDiff: lastStdDiff,
    },
    rating: {
      value: toFixed(rating, 4),
      close: toFixed(closeVal, 4),
      diff: toFixed(diffVal, 4),
      volume: toFixed(volumeVal, 4),
    },
  };
}

/**
 * Find the common products/pairs that exist in each interval.
 */
function intersectMany(...arrs: IntervalData[][]): Map<string, IntervalData[]> {
  const results = new Map<string, IntervalData[]>();
  if (arrs.length < 2) return results;

  // Gets the intersection between two arrays comparing product ids.
  const intersection = (arr1: IntervalData[], arr2: IntervalData[]) => {
    const res: IntervalData[] = [];
    for (const val of arr1) {
      if (arr2.some((p) => p.productId === val.productId)) {
        res.push(val);
      }
    }
    return res;
  };

  // Pop the first array out to compare to 2nd, 3rd, 4th, etc.
  let res = arrs[0].slice();

  // Process the arrays, comparting to each other
  for (let i = 1; i < arrs.length; i++) {
    res = intersection(res, arrs[i]);
  }

  // Combine the results into a [ProductId]: Intervals[] record.
  for (const r of res) {
    const pId: string = r.productId;
    results.set(pId, []);

    // Extract the data for the similar products from each interval it exists in.
    for (let i = 0; i < arrs.length; i++) {
      const intervalData = arrs[i].find((s) => s.productId === pId);
      if (!intervalData) {
        dynamicErr('Impossible to happen... no interval data.');
        continue;
      }

      // Add the data to the rest of it.
      results.get(pId)?.push(intervalData);
    }
  }

  return results;
}
