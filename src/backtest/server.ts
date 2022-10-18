import {abs, add, multiply, subtract} from 'mathjs';
import {BacktestConfig, BacktestResult, Strategy} from '.';
import {CandleDb} from '../sql';
import {delay} from '../utils';
import {Bank} from './bank';
import {Sequence, Trade} from './sequence';
import {CandleSeries} from './series';

export class Backtest {
  private config: BacktestConfig;
  private status: {isBuying: boolean; isSelling: boolean};
  private bank: Bank;
  private sequences: Sequence[] = [];

  constructor(conf: BacktestConfig) {
    conf.strategy = Backtest.fixStrategy(conf.strategy);
    this.config = conf;
    this.bank = new Bank(conf.funds);

    this.status = {isBuying: true, isSelling: false};
  }

  /**
   * Correct a strategy and the numbers to their proper values.
   *   Specifically if there are negative numbers involved.
   */
  static fixStrategy(strat: Strategy): Strategy {
    let {buyRates, sellRate, cutLoss, readjustRate} = strat;
    strat.readjustRate = abs(readjustRate);
    strat.buyRates = buyRates.map((b) => abs(b));
    strat.sellRate = abs(sellRate);
    strat.cutLoss = cutLoss ? abs(cutLoss) : undefined;
    return strat;
  }

  get strategy(): Strategy {
    return this.config.strategy;
  }

  get productId(): string {
    return this.config.productId;
  }

  get isBuying(): boolean {
    return this.status.isBuying;
  }

  get isSelling(): boolean {
    return this.status.isSelling;
  }

  /**
   * Begins the backtest on historical data with the strategy provided.
   *
   * @returns {BacktestResult | undefined} If there is enough data, it prints a result.
   */
  async start(): Promise<BacktestResult | undefined> {
    const {startISO, productId} = this.config;
    const {readjustRate} = this.strategy;
    const candles = await CandleDb.loadCandles(productId, startISO);
    if (candles.length === 0) return;

    let pos: number = 0;
    let lastSequence: number = 1;
    let seq: Sequence | undefined;

    // Tracks the position of the candles as an indicator for direction.
    const candleSeries: CandleSeries = new CandleSeries([], []);

    for (const c of candles) {
      candleSeries.addCandle(c);
      const {low, high, open} = c;
      pos++;

      if (!seq) seq = new Sequence(this.strategy, open, this.bank.reserves);

      let buyFirst: boolean = true;
      switch (candleSeries.movement) {
        case 'up':
          // Check buy, then check sell.
          buyFirst = true;
          break;
        case 'neutral':
          if (candleSeries.strength > 0) {
            // Mostly moving up.
            buyFirst = true;
          } else if (candleSeries.strength === 0) {
            // True neutral.
          } else {
            // Mostly moving down.
            buyFirst = false;
          }
          break;
        case 'down':
          // Check sell, then check buy.
          buyFirst = false;
          break;
      }

      if (buyFirst) {
        const cnt = seq.checkBuys(low);
        if (cnt > 0) await stopper(true, low, pos, cnt, lastSequence);
        if (seq.checkSell(high))
          await stopper(false, high, pos, 1, lastSequence);
      } else {
        if (seq.checkSell(high))
          await stopper(false, high, pos, 1, lastSequence);
        if (!seq.isComplete) {
          const cnt = seq.checkBuys(low);
          if (cnt > 0) await stopper(true, low, pos, cnt, lastSequence);
        }
      }

      if (seq.buys.length === 0) {
        // Check if we resize.
        if (high > multiply(1 + readjustRate, seq.startPrice)) {
          seq = undefined;
          continue;
        }
      }

      if (!seq.isComplete && seq.spentCapped) {
        const cutLoss = seq.cutLossPoint;
        if (cutLoss && low >= cutLoss) {
          // Force sell.
          const trade = new Trade(false, low, seq.sizeAcquired);
          seq.addTrade(trade, true);
          await stopper(false, low, pos, 1, lastSequence);
        }
      }

      if (seq.isComplete) {
        this.sequences.push(seq);
        this.bank.addReserves(seq.position);
        lastSequence = 1;
        seq = undefined;
        continue;
      } else lastSequence++;
    }

    return this.makeResults(lastSequence);
  }

  /**
   * Compiles and creates the results for the backtest.
   */
  makeResults(minSinceLast: number): BacktestResult {
    const spent = this.sequences.reduce((a, b) => {
      return add(a, b.spent);
    }, 0);

    const gained = this.sequences.reduce((a, b) => {
      return add(a, b.sell ? b.sell.value : 0);
    }, 0);

    const tTrades = this.sequences.reduce((a, b) => {
      return a + b.totalTrades;
    }, 0);

    const cutLosses = this.sequences.filter((s) => s.isCutloss);
    const cutLossCost = cutLosses.reduce((a, b) => {
      return add(a, b.position);
    }, 0);

    return {
      productId: this.productId,
      strategy: this.strategy,
      trades: tTrades,
      sequences: this.sequences.length,
      cutLosses: cutLosses.length,
      minSinceLast: minSinceLast,
      daysSinceLast: toN(minSinceLast / (24 * 60), 2),
      startFunds: this.config.funds,
      cutLossCost: toN(cutLossCost, 2),
      spent: toN(spent, 2),
      gained: toN(gained, 2),
      profit: toN(subtract(gained, spent), 2),
      endFunds: toN(this.bank.reserves, 2),
    };
  }
}

let SHOW: {some: string} | undefined;
//SHOW = {some: 'value'};

/**
 * Simple function to print out changes while the algorithm is running.
 *   Only meant for testing and visualizing.
 */
async function stopper(
  isBuy: boolean,
  price: number,
  pos: number,
  cnt: number,
  minSince: number,
) {
  if (!SHOW) return;
  const min = `  min: ${minSince}`;
  console.log(
    `  STOPPER-${pos}: ${isBuy ? 'bought' : '  sold'} ` +
      `${cnt}:  ${price.toPrecision(7)} ` +
      `  ${isBuy ? min : ''}`,
  );
  await delay(500);
}

function toN(value: number, pt: number): number {
  return Number(value.toFixed(pt));
}
