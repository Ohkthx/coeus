import {ProductRanking} from './rank';

/*
 * 1. ARRAY.Rankigs > 0
 * 2. last.movement > 1
 * 3. last.diff >= last.close * buy%
 * 4. last.movement > avgMovement
 *  4a. sort higher diff = last.movement - avgMovement
 * 5. ema14 > 0 && last.close > ema14
 */

export function dynamicAlgorithm(
  rankings: ProductRanking[],
  buyPercentage: number,
): ProductRanking[] {
  if (rankings.length === 0) return [];

  // Required: only positive moving products.
  //rankings = rankings.filter((r) => r.last.movement > 1);
  //rankings.sort((a, b) => (a.last.movement > b.last.movement ? -1 : 1));

  // Required: entry point >= candle difference.
  rankings = rankings.filter(
    (r) => r.last.high - r.last.low >= r.last.close * buyPercentage,
  );

  // Preferred: attempt to get movement higher than avg.
  //const higherAvg = rankings.filter(
  //(r) => r.last.movement > r.last.avgMovement,
  //);
  //if (higherAvg && higherAvg.length > 0) {
  //rankings = higherAvg;

  //// Preferred: larger difference in movement to avg.
  //rankings.sort((a, b) => {
  //const aDiff = a.last.movement - a.last.avgMovement;
  //const bDiff = b.last.movement - b.last.avgMovement;
  //return aDiff > bDiff ? -1 : 1;
  //});
  //}

  // Required: ema has to be less than last close.
  //rankings.filter((r) => {
  //if (r.ema14 > 0 && r.last.close > r.ema14) return r;
  //});

  return rankings;
}
