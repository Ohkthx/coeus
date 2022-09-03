import {mean} from 'mathjs';

function smooth(range: number): number {
  return 2 / (range + 1);
}

export function ema(closes: number[], mRange: number): number[] {
  if (closes.length < mRange) return [];

  const k = smooth(mRange);
  const sma = mean(closes.slice(0, mRange));
  let value = sma;

  const emas: number[] = [sma];
  for (let i = mRange; i < closes.length; i++) {
    value = k * closes[i] + (1 - k) * value;
    emas.push(value);
  }

  return emas;
}

export function sma(closes: number[], mRange: number): number[] {
  if (closes.length < mRange) return [];

  const smas: number[] = [];
  for (let i = 0; i < closes.length - mRange + 1; i++) {
    const value = mean(closes.slice(i, i + mRange));
    smas.push(value);
  }

  return smas;
}
