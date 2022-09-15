import {setToZero} from '../timespan';
import {Stopwatch} from '../stopwatch';
import {schedule, validate} from 'node-cron';
import {coreDebug, coreErr, coreInfo, coreWarn} from '.';
import {ProductRanking, SortFilter, sortRankings} from './rank';
import {initProduct, ProductOptions, Products} from '../product';
import {AnonymousClient} from '../exchange-api/coinbase';
import {Currencies, initCurrency} from '../currency';
import {delay, getUniqueId} from '../utils';
import {APP_DEBUG} from '..';
import {ProductData} from './product-data';
import {DataOpts} from './opts';
import {sendAnalysis, sendRankings} from '../discord/notification';
import {crossAnalysis} from './analysis';
import {DiscordBot} from '../discord/discord-bot';

const PRODUCT_OPTS: ProductOptions = {
  include: ['USD'],
  exclude: [],
  disabledTrades: false,
  stablepairs: false,
};

function printIteration(pId: string, i: number, total: number, ts: number) {
  if (!APP_DEBUG) return;
  const sTotal = (ts / (i + 1)) * total;
  coreDebug(
    `${(((i + 1) / total) * 100).toFixed(0)}% ` +
      `Processing: ${pId}  (${ts.toFixed(0)}s / ${sTotal.toFixed(0)}s)`,
    `\r`,
  );
}

export class State {
  private static initialized: boolean = false;
  private static stateConfig: DataOpts;
  private static updating: boolean = false;
  private static isEnabled: boolean = true;
  private static currentRankings = new Map<string, ProductRanking>();
  private static sortFilter: SortFilter = {};
  static updateId: string = getUniqueId();

  /**
   * Creates a new static State.
   *
   * @param {DataOpts} config - Configuration to use for processing.
   */
  constructor(config: DataOpts) {
    const {candleSizeMin, bucket} = config;
    if (60 % candleSizeMin !== 0) {
      throw new Error(
        `[core] candle size of '${candleSizeMin}' is invalid. ` +
          `Must be divisible by 60.`,
      );
    } else if (candleSizeMin > 60) {
      throw new Error(
        `[core] candle size of '${candleSizeMin}' is invalid. ` +
          `Cannot exceed 60.`,
      );
    } else if (bucket.candlesPer < 2) {
      throw new Error(
        `[core] bucket size of '${bucket.candlesPer}' is invalid. ` +
          `It must have a value greater than 1.`,
      );
    }

    // Set the configuration.
    State.stateConfig = config;
  }

  static get isUpdating(): boolean {
    return State.updating;
  }

  static get timestamp(): Date {
    return setToZero(new Date(), State.stateConfig.candleSizeMin);
  }

  static get config(): DataOpts {
    const opts = State.stateConfig;
    return new DataOpts(State.timestamp, opts.candle, opts.bucket);
  }

  static getFilter(): SortFilter {
    return State.sortFilter;
  }

  static updateFilter(filter: SortFilter) {
    const old = State.getFilter();

    if (filter.count !== undefined && filter.count !== old.count) {
      State.sortFilter.count = filter.count;
    }

    if (filter.close !== undefined && filter.close !== old.close) {
      State.sortFilter.close = filter.close;
    }

    if (filter.diff !== undefined && filter.diff !== old.diff) {
      State.sortFilter.diff = filter.diff;
    }

    if (filter.volume !== undefined && filter.volume !== old.volume) {
      State.sortFilter.volume = filter.volume;
    }

    if (filter.movement !== undefined && filter.movement !== old.movement) {
      State.sortFilter.movement = filter.movement;
    }

    return State.getFilter();
  }

  /**
   * Get the rankings for a specific product/pair.
   *
   * @param {string} productId - Product/pair Id to get ranking for.
   * @returns {ProductRanking | undefined} Product ranking if it is found.
   */
  static getRanking(productId: string): ProductRanking | undefined {
    return State.currentRankings.get(productId);
  }

  static getUnsortedRankings(): ProductRanking[] {
    return [...State.currentRankings.values()];
  }

  /**
   * Get all of the rankings for the known products/pairs.
   *
   * @param {SortFilter} filterOverride - Optional: Overrides the base filter if provided.
   * @returns {ProductRanking[]} Sorted rankings from "best" to "worst"
   */
  static getSortedRankings(filterOverride?: SortFilter): ProductRanking[] {
    if (!filterOverride) filterOverride = State.getFilter();

    const rankings: ProductRanking[] = [];
    for (const r of State.getUnsortedRankings()) rankings.push(r);
    return sortRankings(rankings, filterOverride);
  }

  static getDataPoints(): number {
    return State.getUnsortedRankings().reduce((a, b) => {
      return b.dataPoints + a;
    }, 0);
  }

  /**
   * Overrides the current rankings with the ones provided.
   *
   * @param {ProductRanking[]} rankings - Rankings to override with.
   */
  static setRanking(ranking: ProductRanking) {
    State.currentRankings.set(ranking.productId, ranking);
  }

  /**
   * Disable the state, preventing it from updating.
   */
  static disable() {
    if (!State.isEnabled) return;
    State.isEnabled = false;

    let msg = 'disabled';
    if (State.isUpdating) msg = `${msg}, but currently updating`;
    coreWarn(`${msg}.`);
  }

  /**
   * Wraps updateData to catch thrown errors.
   */
  static async updateDataWrapper() {
    // Prevent running the updater while it already is running or disabled.
    await delay(20000);
    if (State.isUpdating || !State.isEnabled) return;
    State.updating = true;
    await updateData()
      .then(() => {})
      .catch((err) => {
        let errMsg = 'unknown error';
        if (err.response) errMsg = err.response.data.message;
        else if (err instanceof Error) errMsg = err.message;
        else errMsg = err;

        coreErr(`could not update data: ${errMsg}`);
      })
      .finally(() => {
        State.updating = false;
      });
  }

  static checkCrosses(productId: string): string[] {
    const pData = ProductData.find(productId);
    if (!pData) return [];

    let res = crossAnalysis(pData, 'SMA');
    return res.concat(crossAnalysis(pData, 'EMA'));
  }

  /**
   * Wraps initState and initializes the state.
   * A global object that handles the data.
   *
   * @param {Object} opts - Options to modify how the state works.
   * @param {number} opts.periodSpan - Amount of DAYS in the period.
   * @param {number} opts.candleSize - Size of candle in MINUTES.
   * @param {number} opts.bucketSize - Amount of candles to be bundled together.
   * @param {number} opts.intervals - Amount of intervals to generate rankings from.
   */
  static async initWrapper(opts: DataOpts) {
    // Prevent reinitialization.
    if (State.initialized || !State.isEnabled) return;

    State.updating = true;
    await initState(opts)
      .then(() => {})
      .finally(() => {
        State.initialized = true;
        State.updating = false;
      });
  }
}

/**
 * Initialized the state, using the options provided.
 *
 * @param {DataOpts} opts - Options for processing candles and buckets.
 */
async function initState(opts: DataOpts) {
  new State(opts);
  await DiscordBot.setActivity(`with updates.`);

  // Load all of the products and currencies.
  await initProduct();
  await initCurrency();

  // Load all data and get new timestamp.
  const sw = new Stopwatch();
  let loaded: number = 0;
  const products = Products.filter(PRODUCT_OPTS).map((p) => p.id);
  for (let i = 0; i < products.length; i++) {
    const pId = products[i];
    printIteration(pId, i, products.length, sw.print());

    const pData = await ProductData.initialize(pId, opts.start.toISOString());
    if (pData.getCandles().length > 0) loaded++;
  }

  coreDebug(`loaded ${loaded} product data, took ${sw.stop()} seconds.`);

  // Get the bucket data from the candles.
  sw.restart();
  for (let i = 0; i < products.length; i++) {
    const pId = products[i];
    printIteration(pId, i, products.length, sw.print());

    const pData = ProductData.find(pId);
    if (!pData) continue;

    const movement = await pData.getMovement();
    const ranking = pData.updateRanking(movement);
    if (ranking) State.setRanking(ranking);
  }

  // Send the updated rankings to discord.
  const updateId = getUniqueId();
  sendRankings(
    State.getSortedRankings(),
    products.length,
    State.getDataPoints(),
    {
      id: updateId,
      time: Number((sw.totalMs / 1000 + sw.print()).toFixed(4)),
    },
  );
  await DiscordBot.setActivity(`with: ${updateId}`);
  State.updateId = updateId;
  coreDebug(`Bucket and Rank creation execution took ${sw.stop()} seconds.`);
  coreInfo(`timestamp: ${State.timestamp.toISOString()}.`);

  // Update the currencies.
  sw.restart();
  await updateCurrencies();
  coreDebug(`Currency updates execution took ${sw.stop()} seconds.`);

  // Update the products.
  sw.restart();
  await updateProducts();
  coreDebug(`Product updates execution took ${sw.stop()} seconds.`);

  // Run on periods of the candle size.
  const cronSchedule = `*/${opts.candleSizeMin} * * * *`;
  if (!validate(cronSchedule)) {
    throw new Error(`invalid cron schedule provided: '${cronSchedule}'`);
  }

  coreInfo(`update period of ${opts.candleSizeMin} min currently set.`);
  schedule(cronSchedule, State.updateDataWrapper);

  coreDebug(`Startup execution took ${sw.totalMs / 1000} seconds.`);
}

/**
 * Pull new candle data and process it.
 *
 * @returns {Promise<ProductRanking[]>} Ranked products from new data.
 */
async function updateData(): Promise<ProductRanking[]> {
  coreInfo('\nupdating data now!');
  const opts = State.config;
  DiscordBot.setActivity(`with updates.`);

  // Update the currencies.
  const sw = new Stopwatch();
  await updateCurrencies();
  coreDebug(`Currency updates execution took ${sw.stop()} seconds.`);

  sw.restart();
  await updateProducts();
  const products = Products.filter(PRODUCT_OPTS).map((p) => p.id);
  coreDebug(`Product updates execution took ${sw.stop()} seconds.`);

  sw.restart();
  for (let i = 0; i < products.length; i++) {
    const pId = products[i];
    const pData = ProductData.find(pId);
    if (!pData) continue;

    printIteration(pId, i, products.length, sw.print());
    await pData.updateCandles(opts);
  }
  coreDebug(`Candle polling execution took ${sw.stop()} seconds.`);

  // Get the bucket data from the candles.
  sw.restart();
  for (let i = 0; i < products.length; i++) {
    const pId = products[i];
    printIteration(pId, i, products.length, sw.print());

    const pData = ProductData.find(pId);
    if (!pData) continue;

    const movement = await pData.getMovement();
    const ranking = pData.updateRanking(movement);
    if (ranking) State.setRanking(ranking);
  }

  // Send the updated rankings to discord.
  const updateId = getUniqueId();
  sendRankings(
    State.getSortedRankings(),
    products.length,
    State.getDataPoints(),
    {
      id: updateId,
      time: Number((sw.totalMs / 1000 + sw.print()).toFixed(4)),
    },
  );
  DiscordBot.setActivity(`with: ${updateId}`);
  State.updateId = updateId;
  coreDebug(`Bucket and Rank creation execution took ${sw.stop()} seconds.`);

  // Do cross analysis
  sw.restart();
  let crosses: string[] = [];
  for (let i = 0; i < products.length; i++) {
    const pId = products[i];
    printIteration(pId, i, products.length, sw.print());

    const res = State.checkCrosses(pId);
    if (res.length === 0) continue;

    crosses = crosses.concat(res);
  }

  if (crosses.length > 0) {
    sendAnalysis(crosses, updateId);
  }
  coreDebug(`Cross analysis took ${sw.stop()} seconds.`);

  coreDebug(`Total execution took ${sw.totalMs / 1000} seconds.`);
  coreInfo('update complete.\n');

  return State.getSortedRankings();
}

/**
 * Update products.
 */
async function updateProducts() {
  // Get the products.
  return AnonymousClient.getProducts()
    .then((products) => {
      return Products.update(products);
    })
    .catch((err) => {
      if (err instanceof Error) coreErr(err.message);
      else {
        coreErr(`odd error... ${err}`);
      }
    });
}

/**
 * Update currencies.
 */
async function updateCurrencies() {
  // Get the currencies.
  return AnonymousClient.getCurrencies()
    .then((currencies) => {
      return Currencies.update(currencies);
    })
    .catch((err) => {
      if (err instanceof Error) coreErr(err.message);
      else {
        coreErr(`odd error... ${err}`);
      }
    });
}
