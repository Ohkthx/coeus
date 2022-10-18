import {LastMACD, LastMAValues, MACD, MAValues} from './ma';

export const RSI_OVERBOUGHT: number = 70;
export const RSI_OVERSOLD: number = 30;

export interface Indicators {
  dates: string[];
  closes: number[];
  rsi: number[];
  macd: MACD;
  sma: MAValues;
  ema: MAValues;
}

export interface LastIndicators {
  rsi: number;
  macd: LastMACD;
  sma: LastMAValues;
  ema: LastMAValues;
}

export * from './ma';
export * from './macd';
export * from './rsi';
export * from './cross';
