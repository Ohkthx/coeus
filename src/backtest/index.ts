export interface Strategy {
  readjustRate: number;
  buyRates: number[];
  sellRate: number;
  sizeBase: number;
  sizeGrowth: number;
  cutLoss: number | undefined;
}

export interface BacktestConfig {
  productId: string;
  startISO: string;
  funds: number;
  strategy: Strategy;
}

export interface BacktestResult {
  productId: string;
  strategy: Strategy;
  trades: number;
  sequences: number;
  cutLosses: number;
  minSinceLast: number;
  daysSinceLast: number;
  startFunds: number;
  cutLossCost: number;
  spent: number;
  gained: number;
  profit: number;
  endFunds: number;
}

export * from './server';
