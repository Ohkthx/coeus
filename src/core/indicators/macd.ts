import {ProductData} from '../product-data';

/**
 * Calculates an indicator based on MACD (12/26 EMA)
 *
 * @param {ProductData} data - Data to pull old and new data from.
 * @returns {string[]} List of analysis discovered.
 */
export function macdAnalysis(data: ProductData): string[] {
  const last = data.lastRanking?.indicators.macd;
  const now = data.currentRanking?.indicators.macd;
  if (!last || !now) return [];

  const res: string[] = [];
  if (last.value < 0 && now.value > 0) {
    res.push(`crossed the BASE line moving UP.`);
  } else if (last.value > 0 && now.value < 0) {
    res.push(`crossed the BASE line moving DOWN.`);
  }

  let lastAbove: boolean = false;
  let nowAbove: boolean = false;
  if (last.value > last.signal) lastAbove = true;
  if (now.value > now.signal) nowAbove = true;

  if (nowAbove && !lastAbove) {
    res.push(`crossed the SIGNAL line moving UP.`);
  } else if (!nowAbove && lastAbove) {
    res.push(`crossed the SIGNAL line moving DOWN.`);
  }

  for (let i = 0; i < res.length; i++) {
    res[i] = `${data.productId}-MACD: ${res[i]}`;
  }

  return res;
}

/**
 * Calculates the MACD from a short EMA dna a long EMA.
 *
 * @param {number[]} short - List of closes for the shorter EMA.
 * @param {number[]} long - Lost of closes for the longer EMA.
 * @param {Function} format - Optional: Formats the results.
 * @returns {number[]} Difference between the short and long.
 */
export function calcMACD(
  short: number[],
  long: number[],
  format?: (value: number) => number,
): number[] {
  const length = short.length < long.length ? short.length : long.length;

  const macds: number[] = [];
  for (let i = length - 1; i >= 0; i--) {
    if (!short[i] || !long[i]) break;

    let macd = short[i] - long[i];
    if (format) macd = format(macd);
    macds.push(macd);
  }

  return macds.reverse();
}
