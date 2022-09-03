export class Stopwatch {
  startMs: number = Date.now();
  stopped: boolean = false;
  totalMs: number = 0;
  lastMS: number = 0;

  /**
   * Re/start the stopwatch.
   */
  restart = () => this.start();
  start() {
    this.stopped = false;
    this.startMs = Date.now();
  }

  /**
   * Stop the stopwatch.
   *
   * @returns {number} Amount of seconds that has passed.
   */
  stop(): number {
    this.stopped = true;

    const accumulated = Date.now() - this.startMs;
    this.totalMs += accumulated;
    this.lastMS = accumulated;

    return accumulated / 1000;
  }

  print(): number {
    return (Date.now() - this.startMs) / 1000;
  }

  static msToMin(ms: number): number {
    return ms / 1000 / 60;
  }

  static msToDays(ms: number): number {
    return Stopwatch.msToMin(ms) / 60 / 24;
  }

  static daysToMs(days: number): number {
    return days * 24 * 60 * 60 * 1000;
  }
}
