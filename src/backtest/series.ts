import {SimpleCandle} from '../models';

class CandleState {
  position: 1 | 0 | -1;
  isPositive: boolean;

  constructor(candle: SimpleCandle) {
    this.isPositive = candle.open < candle.close;

    const lowHigh = candle.low + candle.high;
    const openClose = candle.open + candle.close;
    if (lowHigh < openClose) this.position = 1;
    else if (lowHigh === openClose) this.position = 0;
    else this.position = -1;
  }
}

export class CandleSeries {
  scalarValues: number[] = [1, 2, 4]; // [oldest, last, new] scalers.
  seriesValues: number[] = [2, 1, 2]; // ['up', 'neutral', 'down'] scalers.

  constructor(scalarValues: number[], seriesValues: number[]) {
    if (scalarValues.length === 3) this.scalarValues = scalarValues;
    if (seriesValues.length === 3) this.seriesValues = seriesValues;
  }

  states: CandleState[] = [];

  /**
   * Calculates the strength in a direction.
   *   Higher positive values - Strong upward movement expected.
   *   Lower negative values - Strong downard movement expected.
   *
   * @returns {number} Strength of the current series.
   */
  get strength(): number {
    let seriesScalar = this.seriesValues[2]; // Defaults to the 'down' scalar.
    if (this.movement === 'up') seriesScalar = this.seriesValues[0];
    else if (this.movement === 'neutral') seriesScalar = this.seriesValues[1];

    return (
      [0, 1, 2].reduce((a, b) => {
        return a + this.value(b) * this.candleScalar(b);
      }, 0) * seriesScalar
    );
  }

  private candleScalar(pos: number): number {
    if (this.scalarValues[pos]) return this.scalarValues[pos];
    return 0;
  }

  private value(pos: number): number {
    if (this.states[pos]) return this.states[pos].position;
    return 0;
  }

  display(): string {
    return `${this.value(0)} | ${this.value(1)} | ${this.value(2)}`;
  }

  /**
   * Gets the expected movement for the series.
   *   'up' - Direction is expected to move upwards.
   *   'neutral' - Direction is undetermined, could be upwards or downwards.
   *   'down' - Direction is expected to move downwards.
   */
  get movement(): 'up' | 'down' | 'neutral' {
    const indicator = this.states[this.states.length - 1].position;
    switch (indicator) {
      case 1:
        return 'up';
      case 0:
        return 'neutral';
      case -1:
        return 'down';
    }
  }

  /**
   * Adds a candle to the series, removing old data if necessary.
   */
  addCandle(candle: SimpleCandle) {
    this.states.push(new CandleState(candle));
    if (this.states.length > 3) {
      this.states.splice(0, 1);
    }
  }
}
