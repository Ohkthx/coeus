import {mean} from 'mathjs';

export interface MACD {
  value: number[];
  signal: number[];
}

export interface MAValues {
  macd?: number[];
  twelve?: number[];
  twentysix?: number[];
  fifty?: number[];
  twohundred?: number[];
}

export interface MASet {
  sma: MAValues;
  ema: MAValues;
}

export interface LastMACD {
  value: number;
  signal: number;
}

export interface LastMAValues {
  nine?: number;
  twelve?: number;
  twentysix?: number;
  fifty?: number;
  twohundred?: number;
}

export interface LastMASet {
  sma: LastMAValues;
  ema: LastMAValues;
}

function lastN(n: number[]): number | undefined {
  if (n.length === 0) return;
  return n[n.length - 1];
}

/**
 * Removes fields that are error'd out.
 */
export function getLastMA(maValues: MAValues): LastMAValues {
  const oldValues: MAValues | any = maValues;
  const newValues: MAValues | any = {};

  for (const [key, value] of Object.entries(oldValues)) {
    if (!value || (value as number[]).length === 0) continue;
    newValues[key] = lastN(value as number[]);
  }

  return newValues;
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
 * @param {Function} format - Optional: Function to use to format the data.
 * @returns {number[]} EMA for each data point calculated. Last is most recent.
 */
export function ema(
  closes: number[],
  mRange: number,
  format?: (value: number) => number,
): number[] {
  if (closes.length < mRange) return [];

  const k = smooth(mRange);
  const sma = mean(closes.slice(0, mRange));
  let value = sma;

  const emas: number[] = [sma];
  for (let i = mRange; i < closes.length; i++) {
    value = k * closes[i] + (1 - k) * value;
    if (format) value = format(value);
    emas.push(value);
  }

  return emas;
}

/**
 * Calculate the SMA from the provided closes over a range of time.
 *
 * @param {number[]} closes - Closes over each day.
 * @param {number} mRange - Amount of days to calculate the SMA on.
 * @param {Function} format - Optional: Function to use to format the data.
 * @returns {number[]} SMA for each data point calculated. Last is most recent.
 */
export function sma(
  closes: number[],
  mRange: number,
  format?: (value: number) => number,
): number[] {
  if (closes.length < mRange) return [];

  const smas: number[] = [];
  for (let i = 0; i < closes.length - mRange + 1; i++) {
    let value = mean(closes.slice(i, i + mRange));
    if (format) value = format(value);
    smas.push(value);
  }

  return smas;
}
