import {ProductData} from './product-data';
import {MAValues} from './rank';

enum CrossChange {
  GOLDEN = 'golden',
  DEATH = 'death',
}

interface CrossResults {
  twelve26?: CrossChange;
  twelve50?: CrossChange;
  twentysix50?: CrossChange;
  twentysix200?: CrossChange;
  fifty200?: CrossChange;
}

/**
 * Check if a cross exists between two points.
 *
 * @param {number} l1 - First EMA/SMA of the old data.
 * @param {number} l2 - Second EMA/SMA of the old data.
 * @param {number} c1 - First EMA/SMA of the new data.
 * @param {number} c2 - Second EMA/SMA of the new data.
 * @returns {CrossChange | 'none'} Cross results if any occurred.
 */
function cross(
  l1: number,
  l2: number,
  c1: number,
  c2: number,
): CrossChange | 'none' {
  if (l1 <= 0 || l2 <= 0 || c1 <= 0 || c2 <= 0) return 'none';
  const lRatio = l1 / l2;
  const cRatio = c1 / c2;

  // Calculate if it was golden or death.
  if (lRatio < 1 && cRatio >= 1) return CrossChange.GOLDEN;
  if (lRatio >= 1 && cRatio < 1) return CrossChange.DEATH;
  return 'none';
}

/**
 * Converts a cross into text.
 *
 * @param {string} pId - Product/pair for the cross.
 * @param {CrossChange} ch - 'death' or 'golden' value.
 * @param {number} low - Bottom EMA/SMA of the cross.
 * @param {number} high - Top of the EMA/SMA of the cross.
 * @param {'SMA' | 'EMA'} ma - Type of MA that the data was based on.
 * @returns {string} Text regarding the cross.
 */
function crossToText(
  pId: string,
  ch: CrossChange,
  low: number,
  high: number,
  ma: 'SMA' | 'EMA',
): string {
  return (
    `${pId}-${low}-${high}-${ma}: '${ch}' cross ocurred between ` +
    `${low}-${ma} and ${high}-${ma}.`
  );
}

/**
 * Converts all crosses into text.
 *
 * @param {string} pId - Product/pair of the cross.
 * @param {CrossResults} x - All crosses that occurred.
 * @param {'SMA' | 'EMA'} ma - Type of MA that was processed.
 * @returns {string[]} List of crosses that occurred in text form.
 */
function convertCross(
  pId: string,
  x: CrossResults,
  ma: 'SMA' | 'EMA',
): string[] {
  const res: string[] = [];

  // Add the cross data if it existed.
  if (x.twelve26) res.push(crossToText(pId, x.twelve26, 12, 26, ma));
  if (x.twelve50) res.push(crossToText(pId, x.twelve50, 12, 50, ma));
  if (x.twentysix50) res.push(crossToText(pId, x.twentysix50, 26, 50, ma));
  if (x.twentysix200) res.push(crossToText(pId, x.twentysix200, 26, 200, ma));
  if (x.fifty200) res.push(crossToText(pId, x.fifty200, 50, 200, ma));

  return res;
}

/**
 * Checks if a cross occurred for a product based on the data provided.
 *
 * @param {ProductData} data - Data to compare for crosses.
 * @param {'SMA' | 'EMA'} ma - Moving average to process.
 * @returns {string[]} All crosses that occurred for a product in text format.
 */
export function crossAnalysis(data: ProductData, ma: 'SMA' | 'EMA'): string[] {
  const lastR = data.lastRanking;
  const currentR = data.currentRanking;
  if (!lastR || !currentR) return [];

  let xResults: CrossResults = {};
  if (ma === 'SMA') xResults = checkMA(lastR.sma, currentR.sma);
  else xResults = checkMA(lastR.ema, currentR.ema);

  return convertCross(data.productId, xResults, ma);
}

/**
 * Checks if a cross occurred between to Moving Averages.
 *
 * @param {MAValues} l - Old (last) moving average values.
 * @param {MAValues} c - New (current) moving average values.
 * @returns {CrossResults} All crosses that occurred.
 */
function checkMA(l: MAValues, c: MAValues): CrossResults {
  const res: CrossResults = {};

  // 12-26 cross.
  if (!l.twelve || !l.twentysix || !c.twelve || !c.twentysix) return res;
  let change = cross(l.twelve, l.twentysix, c.twelve, c.twentysix);
  if (change !== 'none') res.twelve26 = change;

  // 12-50 cross.
  if (!l.fifty || !c.fifty) return res;
  change = cross(l.twelve, l.fifty, c.twelve, c.fifty);
  if (change !== 'none') res.twelve50 = change;

  // 26-50 cross.
  change = cross(l.twentysix, l.fifty, c.twentysix, c.fifty);
  if (change !== 'none') res.twentysix50 = change;

  // 26-200 cross.
  if (!l.twohundred || !c.twohundred) return res;
  change = cross(l.twentysix, l.twohundred, c.twentysix, c.twohundred);
  if (change !== 'none') res.twentysix200 = change;

  // 50-200 cross.
  change = cross(l.fifty, l.twohundred, c.fifty, c.twohundred);
  if (change !== 'none') res.fifty200 = change;

  return res;
}
