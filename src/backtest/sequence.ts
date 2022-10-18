import {abs, add, divide, multiply, subtract} from 'mathjs';
import {Strategy} from '.';

export class Trade {
  isBuy: boolean;
  price: number;
  size: number;

  constructor(isBuy: boolean, price: number, size: number) {
    this.isBuy = isBuy;
    this.price = price;
    this.size = size;
  }

  /**
   * Calculates the value of a trade based on price and size.
   *
   * @returns {number} Cost / Gained for the trade.
   */
  get value(): number {
    return multiply(this.price, this.size);
  }
}

export class Sequence {
  buyPoints: number[];
  private buyRates: number[];
  private sellRate: number;
  startPrice: number;
  buys: Trade[] = [];
  sell: Trade | undefined;

  private sizePoints: number[];
  private cutloss: number | undefined;
  isCutloss: boolean = false;

  constructor(strategy: Strategy, startPrice: number, funds: number) {
    const {buyRates, sellRate, sizeBase, sizeGrowth} = strategy;
    this.startPrice = startPrice;
    this.buyRates = buyRates.map((r) => abs(r));
    this.sellRate = abs(sellRate);
    this.cutloss = abs(strategy.cutLoss ?? 0);
    this.buyPoints = getBuyPoints(startPrice, this.buyRates);
    this.sizePoints = getBuySizes(sizeBase, sizeGrowth, this.buyPoints, funds);
  }

  /**
   * Checks if it is a completed sequence, based on if a sell has happened.
   */
  get isComplete(): boolean {
    return this.sell !== undefined;
  }

  /**
   * Checks if it can perform anymore buys.
   */
  get spentCapped(): boolean {
    return this.buyPos >= this.buyPoints.length;
  }

  private get buyPos(): number {
    return this.buys.length;
  }

  /**
   * Calculates the amount the series has currently spent.
   */
  get spent(): number {
    return this.buys.reduce((a, b) => {
      return add(a, b.value);
    }, 0);
  }

  /**
   * Calculates the net gain/loss for the sequence.
   */
  get position(): number {
    return subtract(this.sell ? this.sell.value : 0, this.spent);
  }

  private get sizeExpected(): number {
    return this.sizePoints.reduce((a, b) => {
      return add(a, b);
    }, 0);
  }

  private get spentExpected(): number {
    let spent: number = 0;
    for (let i = 0; i < this.buyPoints.length; i++) {
      spent = add(spent, multiply(this.sizePoints[i], this.buyPoints[i]));
    }

    return spent;
  }

  /**
   * Total size across all trades that have been completed.
   */
  get sizeAcquired(): number {
    return this.buys.reduce((a, b) => {
      return add(a, b.size);
    }, 0);
  }

  /**
   * The point the sequence should sell to attempt to cut losses early.
   */
  get cutLossPoint(): number | undefined {
    if (this.cutloss === undefined) return;
    const cAvgE = multiply(this.spentExpected, 1 - this.cutloss);
    return divide(cAvgE, this.sizeExpected);
  }

  /**
   * The next price to perform a buy at.
   */
  get buyPoint(): number | undefined {
    return this.buyPoints[this.buyPos];
  }

  /**
   * The next price to perform a sell at.
   */
  get sellPoint(): number | undefined {
    if (this.sizeAcquired === 0) return;

    const priceAvg = divide(this.spent, this.sizeAcquired);
    const pt = multiply(1 + this.sellRate, priceAvg);

    return pt;
  }

  /**
   * Total amount of trades performed by the sequence.
   */
  get totalTrades(): number {
    const sell = this.sell ? 1 : 0;
    return sell + this.buyPos;
  }

  private hitBuy(low: number): boolean {
    if (this.spentCapped) return false;
    return low <= this.buyPoints[this.buyPos];
  }

  private hitSell(high: number): boolean {
    const pt = this.sellPoint;
    return !pt ? false : high >= pt;
  }

  checkBuys(low: number): number {
    const buyCount: number = this.buyPos;

    while (this.hitBuy(low)) {
      this.makeTrade(true);
    }

    return this.buyPos - buyCount;
  }

  /**
   * Checks if sell can occurr, if so- makes the trade.
   */
  checkSell(high: number): boolean {
    if (this.sellPoint && this.hitSell(high)) {
      // A sell occurred, created a trade.
      this.makeTrade(false);
    }

    return this.sell !== undefined;
  }

  /**
   * Adds a trade to the sequence.
   *
   * @param {Trade} trade - Trade to add.
   * @param {boolean} isCutloss - If the trade is a forced cutloss trade.
   */
  addTrade(trade: Trade, isCutloss?: boolean) {
    if (isCutloss !== undefined) this.isCutloss = isCutloss;
    if (trade.isBuy) this.buys.push(trade);
    else this.sell = trade;
  }

  private makeTrade(isBuy: boolean, priceOverride?: number) {
    let size: number = 0;
    if (isBuy) size = this.sizePoints[this.buyPos];
    else size = this.sizeAcquired;

    let price: number = 0;
    if (priceOverride !== undefined) price = priceOverride;
    else if (isBuy) price = this.buyPoint ?? 0;
    else price = this.sellPoint ?? 0;

    this.addTrade(new Trade(isBuy, price, size));
  }
}

function getBuyPoints(start: number, rates: number[]): number[] {
  const buyPoints: number[] = [];
  let pt: number = start;
  for (const r of rates) {
    pt = multiply(1 - r, pt);
    buyPoints.push(pt);
  }

  return buyPoints;
}

function getBuySizes(
  sizeBase: number,
  sizeGrowth: number,
  buyPoints: number[],
  funds: number,
): number[] {
  let pt: number = sizeBase;
  const baseSizePoints: number[] = [pt];
  for (let i = 1; i < buyPoints.length; i++) {
    pt = multiply(pt, sizeGrowth);
    baseSizePoints.push(pt);
  }

  let baseTotalCost: number = 0;
  for (let i = 0; i < baseSizePoints.length; i++) {
    const ptCost = multiply(baseSizePoints[i], buyPoints[i]);
    baseTotalCost = add(baseTotalCost, ptCost);
  }

  const costRatio = divide(funds, baseTotalCost);
  return baseSizePoints.map((s) => multiply(s, costRatio));
}
