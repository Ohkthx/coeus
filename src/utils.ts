/**
 * Trims a number to the desired amount of decimal places.
 *
 * @param {number} n - Number to modify.
 * @param {number} dec - Number of decimal places.
 * @returns {number} Newly formatted number.
 */
export function toFixed(n: number, dec: number): number {
  return parseFloat(n.toFixed(dec));
}

/**
 * Delays nodejs by a specified amount of time.
 *
 * @param {number} ms - Time in milliseconds (ms) to delay by.
 */
export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Converts a string | boolean to a boolean value.
 *
 * @param {string | boolean | undefined} bool - Boolean to convert.
 * @returns {boolean} Result of the conversion, defaults to 'false' on empty.
 */
export function parseBoolean(bool: string | boolean | undefined): boolean {
  if (bool === undefined || bool === '') return false;
  else if (typeof bool === 'boolean') return bool;
  return bool.toLowerCase() === 'true';
}
