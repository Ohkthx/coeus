import {abs} from 'mathjs';
import {RSI_OVERBOUGHT, RSI_OVERSOLD} from '.';
import {ProductData} from '../product-data';

export function rsiAnalysis(data: ProductData): string | undefined {
  const last = data.lastRanking?.indicators.rsi;
  const now = data.currentRanking?.indicators.rsi;
  if (!last || !now) return;

  const wasInRange = last >= RSI_OVERSOLD && last <= RSI_OVERBOUGHT;
  const isHigh = now > RSI_OVERBOUGHT;
  const isLow = now < RSI_OVERSOLD;

  const pId = data.productId;
  if (wasInRange && isHigh) {
    return `${pId}-RSI: now overbought starting @$${data.lastClose}, RSI: ${now}.`;
  } else if (wasInRange && isLow) {
    return `${pId}-RSI: now oversold starting @$${data.lastClose}, RSI: ${now}.`;
  }
}

/**
 * Gets the data for the first Relative Strength value (gain average / loss average)
 *
 * @param {number[]} values - Values to get an average of.
 */
function getFirstRS(values: number[]): {
  gainAvg: number;
  lossAvg: number;
  last: number;
} {
  let gainTotal: number = 0;
  let lossTotal: number = 0;

  for (const [n, value] of values.entries()) {
    if (n === 0) continue;

    // Get the difference.
    const change = value - values[n - 1];
    if (change > 0) gainTotal += change;
    else lossTotal += change;
  }

  return {
    gainAvg: gainTotal / (values.length - 1),
    lossAvg: lossTotal / (values.length - 1),
    last: values[values.length - 1],
  };
}

/**
 * Calculates the RSI from closes, requires data to be from oldests to newest.
 * There must be at least 14 data points for this to work.
 *
 * @param {number[]} closes - An array of closes.
 * @param {number} timeLength - Span of time for the RSI.
 * @returns {number[]} RSI values computed. Last value is most recent.
 */
export function calcRSI(closes: number[], timeLength: number = 14): number[] {
  if (closes.length < timeLength + 1) return [];

  const preCloses = closes.slice(0, timeLength + 1);
  let {gainAvg, lossAvg, last} = getFirstRS(preCloses);

  // Calculate the first RSI.
  let rsiv: number = 100 - 100 / (1 + gainAvg / abs(lossAvg));
  const rsi: number[] = [Number(rsiv.toFixed(2))];

  for (let i = timeLength + 1; i < closes.length; i++) {
    const value = closes[i] - last;
    if (value > 0) {
      gainAvg = (gainAvg * (timeLength - 1) + value) / timeLength;
      lossAvg = (lossAvg * (timeLength - 1) + 0) / timeLength;
    } else {
      lossAvg = (lossAvg * (timeLength - 1) + value) / timeLength;
      gainAvg = (gainAvg * (timeLength - 1) + 0) / timeLength;
    }

    // Calculate the RS and RSI.
    rsiv = 100 - 100 / (1 + gainAvg / abs(lossAvg));
    rsi.push(Number(rsiv.toFixed(2)));
    last = closes[i];
  }

  return rsi;
}
