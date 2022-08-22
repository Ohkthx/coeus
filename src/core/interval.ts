import {divide, mean, multiply} from 'mathjs';
import {CLOSE_WEIGHT, DIFF_WEIGHT, dynamicDebug, VOLUME_WEIGHT} from '.';
import {APP_DEBUG} from '..';
import {BucketData} from './bucket';
import {createSpan, Timespan} from './timespan';

export interface IntervalData {
  productId: string;
  rating: number;
  close: number;
  diff: number;
  volume: number;
  data: {
    length: number;
    lastEntry: BucketData;
  };
}

/**
 * Creates intervals from bucket data.
 *
 * @param {Timespan[]} periods - Array of timespans to break records into.
 * @param {Record<string, BucketData[]>} records - Bucket data for all products.
 * @param {number} minSize - Minimum size the intervals must be to be factored in.
 * @param {number} intervalCount - Amount of intervals to create.
 * @returns {IntervalData[][]} - Interval data
 */
export function makeIntervals(
  periods: Timespan[],
  records: Record<string, BucketData[]>,
  minSize: number,
  intervalCount: number,
): IntervalData[][] {
  // Interval #: Interval Data for all products in that same interval.
  const intervals: IntervalData[][] = [];
  for (let i = 0; i < intervalCount; i++) {
    intervals[i] = [];
  }

  // Convert to a map.
  const mappedData = new Map<string, BucketData[]>();
  for (const pId in records) mappedData.set(pId, records[pId]);

  // Create the intervals for each product.
  let i: number = 0;
  for (const pId of mappedData.keys()) {
    if (APP_DEBUG) {
      const maxLen = mappedData.size.toString();
      const pad = maxLen.length;
      const value: string = `${(++i).toString().padEnd(pad)}`;
      const counter = `${value} / ${maxLen.padEnd(pad)}`;
      dynamicDebug(`[${counter}] creating intervals for '${pId}'.`, '\r');
    }

    const data = mappedData.get(pId) ?? [];

    // data is too small, do not bother processing it.
    if (data.length < minSize) continue;

    // Create the sets of intervals.
    const sets = getIntervals(periods, data);
    for (const i in sets) {
      // Convert the bucket data into interval data and save it to the proper interval.
      const interval = makeInterval(pId, sets[i]);
      intervals[i].push(interval);
    }
  }
  return intervals;
}

/**
 * Converts bucket data into a singular interval data for processing.
 */
function makeInterval(productId: string, data: BucketData[]): IntervalData {
  const lastEntry = data[data.length - 1];

  const closes: number[] = data.map((d) => {
    return d.closeStd;
  });
  const closeAvg: number = mean(closes);
  const lastClose = lastEntry.closeStd;
  const closeRatio = divide(lastClose, closeAvg);

  const volumes: number[] = data.map((d) => {
    return d.volume;
  });
  const volAvg: number = mean(volumes);
  const volRatio = divide(lastEntry.volume, volAvg);

  const diffs: number[] = data.map((d) => {
    return d.diffStd;
  });
  const diffAvg: number = mean(diffs);
  const diffRatio = divide(lastEntry.diffStd, diffAvg);

  // Factor in the weights to create a rating.
  const weighted_sum: number =
    multiply(closeRatio, CLOSE_WEIGHT) +
    multiply(volRatio, VOLUME_WEIGHT) +
    multiply(diffRatio, DIFF_WEIGHT);

  return {
    productId: productId,
    rating: weighted_sum,
    close: closeRatio,
    diff: diffRatio,
    volume: volRatio,
    data: {
      length: data.length,
      lastEntry: lastEntry,
    },
  };
}

/**
 * Creates the start and end times for each interval.
 *
 * @param {string} startISO - Earliest time to being from.
 * @param {number} intervals - Amount of intervals to create.
 * @param {number} offset - Amount of buckets to offset data by.
 * @param {number} bucketCount - Amount of buckets per interval.
 * @param {number} bucketLen - Length of time a bucket is in MINUTES.
 * @returns {Timespan[]} Periods of times for each interval.
 */
export function getPeriods(
  startISO: string,
  intervals: number,
  offset: number,
  bucketCount: number,
  bucketLen: number,
): Timespan[] {
  const timestamps: Timespan[] = [];

  for (let i = 0; i < intervals; i++) {
    // Create a timespan with the start time.
    const span = createSpan(startISO, startISO);

    // Get end time.
    const change = new Date(startISO);
    change.setMinutes(change.getMinutes() + bucketCount * bucketLen);
    span.end = change;
    timestamps.push(span);

    // Offset the start.
    const os = new Date(span.start);
    os.setMinutes(os.getMinutes() + bucketLen * offset);

    // Reassign the start to the offset.
    startISO = os.toISOString();
  }

  return timestamps;
}

/**
 * Break the bucket data into the periods / intervals based on time.
 */
function getIntervals(periods: Timespan[], data: BucketData[]): BucketData[][] {
  const results: BucketData[][] = [];

  for (const p of periods) {
    const items = data.filter(
      (d) =>
        d.timestampISO > p.start.toISOString() &&
        d.timestampISO <= p.end.toISOString(),
    );
    results.push(items);
  }

  return results;
}
