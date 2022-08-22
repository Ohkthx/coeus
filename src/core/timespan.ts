import {inspect} from 'util';
import {dynamicInfo} from '.';

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
 * @param {number} candleSize - Size/length of candles to set intervals.
 * @returns {Timespan} Span of time between date supplied and now.
 */
export function getSpan(
  last: Date,
  candleSize: number,
  nowOverride: Date = new Date(),
): Timespan {
  const now = nowOverride;
  const current = setToZero(now, candleSize);
  last = setToZero(last, candleSize);

  return {
    granularity: candleSize * 60,
    start: last,
    end: current,
    lengthMs: current.getTime() - last.getTime(),
  };
}

/**
 * Takes in timespan and resizes it to fit proper increments of time.
 *
 * @param {Timespan} span - Span of time to modify.
 * @param {number} maxMinutes - Maximum amount of MINUTES the span consists of.
 * @returns {Timespan} Corrected timespan that fits criteria provided.
 */
export function resizeSpan(span: Timespan, maxMinutes: number): Timespan {
  const {end, lengthMs} = fixSpan(span);
  const maxSizeMs = maxMinutes * 60 * 1000;

  if (lengthMs > maxSizeMs) {
    // Span is too large, resize to maximum.
    span.start = setToPast(end, maxMinutes);
    span.lengthMs = span.end.getTime() - span.start.getTime();
  }

  return span;
}

/**
 * Gets the estimated amount of items within a given span.
 *
 * @param {Timespan} span - Span of time to calculate from.
 * @returns {number} Amount of items that should exist.
 */
export function estimatedSpanCount(span: Timespan): number {
  const {lengthMs, granularity} = fixSpan(span);

  // Get the difference.
  const sec = lengthMs / 1000;

  return sec / granularity;
}

/**
 * Gets the estimated amount of items within a given period.
 *
 * @param {number} periodSpan - Span of time in DAYS to calculate from.
 * @param {number} granularity - Length of individual items in SECONDS.
 * @returns {number} Amount of items that should exist.
 */
export function estimatedPeriodCount(
  periodSpan: number,
  granularity: number,
): number {
  const lengthSec = periodSpan * 24 * 60 * 60;
  return lengthSec / granularity;
}

/**
 * Prints a timespans data to console.
 *
 * @param {Timespan} span - Data to print.
 */
export function printSpan(span: Timespan) {
  dynamicInfo(inspect(span, false, 2, true));
}

function setToZero(ts: Date, candleSize: number): Date {
  ts.setSeconds(0);
  ts.setMilliseconds(0);

  // Set the minutes to a number divisible by candleSize.
  const remainder = ts.getMinutes() % candleSize;
  if (remainder !== 0) {
    ts.setMinutes(ts.getMinutes() - remainder);
  }

  return ts;
}

function fixSpan(span: Timespan): Timespan {
  let {start, end} = span;

  if (end.getTime() < start.getTime()) {
    // Swap the timestamps so that start is older, end is newer.
    const temp = end;
    end = start;
    start = temp;
  }

  return {
    granularity: span.granularity,
    start: start,
    end: end,
    lengthMs: span.lengthMs,
  };
}
