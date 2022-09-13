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

function cross(
  l1: number,
  l2: number,
  c1: number,
  c2: number,
): CrossChange | 'none' {
  if (l1 === -1 || l2 === -1 || c1 === -1 || c2 === -1) return 'none';
  const lRatio = l1 / l2;
  const cRatio = c1 / c2;

  if (lRatio < 1 && cRatio >= 1) return CrossChange.GOLDEN;
  if (lRatio >= 1 && cRatio < 1) return CrossChange.DEATH;
  return 'none';
}

function crossToText(
  pId: string,
  ch: CrossChange,
  low: number,
  high: number,
  ma: 'SMA' | 'EMA',
): string {
  return `${pId}: '${ch}' cross ocurred between ${low}-${ma} and ${high}-${ma}.`;
}

function convertCross(
  pId: string,
  x: CrossResults,
  ma: 'SMA' | 'EMA',
): string[] {
  const res: string[] = [];

  if (x.twelve26) res.push(crossToText(pId, x.twelve26, 12, 26, ma));
  if (x.twelve50) res.push(crossToText(pId, x.twelve50, 12, 50, ma));
  if (x.twentysix50) res.push(crossToText(pId, x.twentysix50, 26, 50, ma));
  if (x.twentysix200) res.push(crossToText(pId, x.twentysix200, 26, 200, ma));
  if (x.fifty200) res.push(crossToText(pId, x.fifty200, 50, 200, ma));

  return res;
}

export function crossAnalysis(data: ProductData, ma: 'SMA' | 'EMA'): string[] {
  const lastR = data.lastRanking;
  const currentR = data.currentRanking;
  if (!lastR || !currentR) return [];

  let xResults: CrossResults = {};
  if (ma === 'SMA') xResults = checkMA(lastR.sma, currentR.sma);
  else xResults = checkMA(lastR.ema, currentR.ema);

  return convertCross(data.productId, xResults, ma);
}

function checkMA(l: MAValues, c: MAValues): CrossResults {
  const res: CrossResults = {};

  // 12-26 cross.
  let change = cross(l.twelve, l.twentysix, c.twelve, c.twentysix);
  if (change !== 'none') res.twelve26 = change;

  // 12-50 cross.
  change = cross(l.twelve, l.fifty, c.twelve, c.fifty);
  if (change !== 'none') res.twelve50 = change;

  // 26-50 cross.
  change = cross(l.twentysix, l.fifty, c.twentysix, c.fifty);
  if (change !== 'none') res.twentysix50 = change;

  // 26-200 cross.
  change = cross(l.twentysix, l.twohundred, c.twentysix, c.twohundred);
  if (change !== 'none') res.twentysix200 = change;

  // 50-200 cross.
  change = cross(l.fifty, l.twohundred, c.fifty, c.twohundred);
  if (change !== 'none') res.fifty200 = change;

  return res;
}
