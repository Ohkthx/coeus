import objectHash from 'object-hash';

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

/**
 * Checks if the passed object is an array.
 *
 * @param {any} data - Object to check.
 * @returns {boolean} True if object is an array.
 */
export function isArray(data: any): boolean {
  return !!data && data.constructor === Array;
}

/**
 * Checks if the passed object is a string.
 *
 * @param {any} data - Object to check.
 * @returns {boolean} True if Object is an array.
 */
export function isText(data: any): data is string {
  return typeof data === 'string';
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}

export function getUniqueId(): string {
  const color = [
    'blue',
    'green',
    'purple',
    'pink',
    'yellow',
    'teal',
    'red',
    'white',
    'black',
    'gray',
    'orange',
    'brown',
    'gold',
    'silver',
    'magenta',
    'scarlet',
    'indigo',
    'violet',
    'cyan',
    'maroon',
    'bronze',
  ];

  const item = [
    'truck',
    'pencil',
    'flower',
    'map',
    'sky',
    'basket',
    'table',
    'tree',
    'speaker',
    'book',
    'lamp',
    'phone',
    'clock',
    'blanket',
    'dog',
    'cat',
    'candle',
    'skull',
    'box',
    'key',
    'pillow',
    'plant',
  ];

  const index1 = randomInt(0, color.length);
  const index2 = randomInt(0, item.length);
  return `${color[index1]}-${item[index2]}`;
}

/**
 * Generates a hash for the object that is passed.
 *
 * @param {Object} obj - Object to be hashed.
 * @returns {string} Hash of the object.
 */
export function getHash(obj: Object): string {
  return objectHash(obj);
}
