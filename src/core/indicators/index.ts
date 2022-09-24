import {LastMACD, LastMAValues} from './ma';

export interface Indicators {
  sma: LastMAValues;
  ema: LastMAValues;
  macd: LastMACD;
}

export * from './ma';
export * from './analysis';
