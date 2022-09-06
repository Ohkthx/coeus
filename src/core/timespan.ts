import {inspect} from 'util';
import {coreInfo} from '.';

export interface Timespan {
  granularity: number;
  start: Date;
  end: Date;
  lengthMs: number;
}

/**
 * Set a date to n earlier days.
 *
 * @param {Date} ts - Timestamp of the start date.
 * @param {number} n - Amount of MINUTES.
 * @returns {Date} Corrected date set in the past.
 */
export function setToPast(ts: Date, n: number): Date {
  const temp = new Date(ts);
  temp.setMinutes(ts.getMinutes() - n);
  return temp;
}

/**
 * Make a span without modifying dates.
 *
 * @param {string} start - Start time of the timespan.
 * @param {string} end - End time of the timespan.
 * @returns {Timespan} A new timespan.
 */
export function createSpan(start: string, end: string): Timespan {
  const s = new Date(start);
  const e = new Date(end);

  return {
    start: s,
    end: e,
    lengthMs: e.getTime() - s.getTime(),
    granularity: 0,
  };
}

/**
 * Get a span from a past date to the current moment, cleaning the times.
 *
 * @param {Date} last - Date of the past.
 * @param {number} interval - Length of each interval in minutes.
 * @param {Date} nowOverride - Overrides the current moment with user provided.
 * @returns {Timespan} Span of time between date supplied and now.
 */
export function getSpan(
  last: Date,
  interval: number,
  nowOverride: Date = new Date(),
): Timespan {
  const now = nowOverride;
  const current = setToZero(now, interval);
  last = setToZero(last, interval);

  return {
    granularity: interval * 60,
    start: last,
    end: current,
    lengthMs: current.getTime() - last.getTime(),
  };
}

/**
 * Prints a timespans data to console.
 *
 * @param {Timespan} span - Data to print.
 */
export function printSpan(span: Timespan) {
  coreInfo(inspect(span, false, 2, true));
}

/**
 * Sets the minutes to the last length of interval (min),  sets seconds and
 * milliseconds to zero.
 *
 * @param {Date} ts - Current timestamp to set to zero.
 * @param {number} interval - Size of the intervals in minutes.
 * @returns {Date} Date that has been set to zero.
 */
export function setToZero(ts: Date, interval: number): Date {
  ts.setSeconds(0);
  ts.setMilliseconds(0);

  // Set the minutes to a number divisible by candleSize.
  const remainder = ts.getMinutes() % interval;
  if (remainder !== 0) {
    ts.setMinutes(ts.getMinutes() - remainder);
  }

  return ts;
}
