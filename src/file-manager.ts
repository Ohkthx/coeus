import {existsSync, unlinkSync} from 'fs';
import {delay} from './utils';

const IS_DELETING = new Map<string, number>(); // Filename: Time in MS.

export class FileManager {
  /**
   * Delays a file deletion based on ms (miliseconds)
   *
   * @param {string} filename - Name of the file to be deleted.
   * @param {number} msDelay - Delay (ms) till deletion.
   */
  static async queueDeletion(filename: string, msDelay: number) {
    IS_DELETING.set(filename, msDelay);

    await delay(msDelay);
    if (existsSync(filename)) unlinkSync(filename);

    IS_DELETING.delete(filename);
  }

  /**
   * Forcefully deletes all queued deleted files.
   */
  static async forceDeletionAll() {
    for (const [filename, value] of IS_DELETING.entries()) {
      if (value > 0) FileManager.forceDeletion(filename);
    }
  }

  /**
   * Forcefully deletes the specified file.
   *
   * @param {string} filename - File to be deleted if it exists.
   */
  static async forceDeletion(filename: string) {
    if (existsSync(filename)) unlinkSync(filename);
    IS_DELETING.delete(filename);
  }

  /**
   * Checks if there are files currently deleting.
   */
  static isDelayDeletion(): boolean {
    for (const [_, value] of IS_DELETING.entries()) {
      if (value > 0) return true;
    }

    return false;
  }

  static exists(filename: string): boolean {
    return existsSync(filename);
  }
}
