import {add} from 'mathjs';

export class Bank {
  private value: number;

  constructor(reserves: number) {
    this.value = reserves;
  }

  /**
   * Get the currently held amount.
   *
   * @returns {number} Value being held.
   */
  get reserves(): number {
    return this.value;
  }

  /**
   * Adds currency to the bank.
   *
   * @param {number} value - Amount to add to the reserves.
   */
  addReserves(value: number) {
    this.value = add(this.value, value);
  }
}
