import {getCandles, ONE_DAY_TO_S} from './core';
import {delay} from './utils';
import mongoose from 'mongoose';
import {
  APP_DEBUG,
  DB_DATABASE,
  USE_SANDBOX,
  appInfo,
  appErr,
  appWarn,
  appDebug,
  S_GRANULARITY,
  MAX_DAYS_OF_DATA,
} from '.';
import {DataOpts} from './core/opts';
import {initProduct, ProductOptions, Products} from './product';
import {initCurrency} from './currency';
import {Stopwatch} from './stopwatch';
import {setToZero} from './timespan';
import {schedule, validate} from 'node-cron';
import {CandleDb} from './sql';

appInfo(`APP_DEBUG set to '${APP_DEBUG}'`);
appInfo(`DB_DATABASE set to '${DB_DATABASE}'`);
appInfo(`USE_SANDBOX set to '${USE_SANDBOX}'`);
appInfo(`S_GRANULARITY set to '${S_GRANULARITY}'`);

let PULLING_DATA: boolean = false;
const MAX_PULL: number = 5; // Maximum amount of products to pull per span of time.
const CANDLES_PER_BUCKET: number = ONE_DAY_TO_S / S_GRANULARITY;
const PULL_OPTS = new DataOpts(
  new Date(), // Time to end at.
  {
    frequency: 30, // Amount of candles to wait between updates.
    sGranularity: 60, // Size of each candle in seconds.
    pullNew: true, // Pull new candle data or not.
  },
  {
    candlesPer: CANDLES_PER_BUCKET, // Amount of candles per bucket.
    total: MAX_DAYS_OF_DATA, // Amount of buckets.
  },
);

const PRODUCTS_FILTER: ProductOptions = {
  include: ['USD'],
  exclude: [],
  disabledTrades: false,
  stablepairs: false,
};

let sigintFired: number = 0; // Prevents spam messages from occurring.
process.on('SIGINT', async () => {
  sigintFired++;
  if (sigintFired > 1 && sigintFired < 5) return;
  else if (sigintFired >= 5) process.exit();

  appWarn('\n\nCaught interrupt signal');
  await killAll();
});

/**
 * Kills the connection and stops saving / processing data.
 */
async function killAll() {
  // Wait for candles to be done saving.
  if (CandleDb.isSaving()) {
    appInfo('[candles] currently saving candles... waiting.');
    while (CandleDb.isSaving()) await delay(250);
    await CandleDb.killConnection();
    appInfo('[candles] saved.');
  }

  process.exit();
}

function printIteration(pId: string, i: number, total: number, ts: number) {
  if (!APP_DEBUG) return;
  const sTotal = (ts / (i + 1)) * total;
  appDebug(
    `${(((i + 1) / total) * 100).toFixed(0)}% ` +
      `Processing: ${pId}  (${ts.toFixed(0)}s / ${sTotal.toFixed(0)}s)`,
    `\r`,
  );
}

/**
 * Pulls the data only for products that do not have any data yet.
 */
async function pullData() {
  if (PULLING_DATA) {
    appInfo(`still processing a prior update.`);
    return;
  }

  PULLING_DATA = true;

  let pulled: string[] = [];
  const sw = new Stopwatch();

  // Iterate our products.
  const products = Products.filter(PRODUCTS_FILTER).map((p) => p.id);
  for (let i = 0; i < products.length; i++) {
    if (pulled.length >= MAX_PULL) break;

    const pId = products[i];
    printIteration(pId, i, products.length, sw.print());

    // Get currently saved candles.
    let candles = await CandleDb.loadCandles(pId);
    if (candles.length > 0) continue;

    // Get new candles.
    candles = await getCandles(pId, PULL_OPTS);
    await CandleDb.saveCandles(pId, candles, true);
    pulled.push(`[${pId}]`);
  }

  if (pulled.length > 0) {
    appInfo(`Pulled: ${pulled.join(' ')}\n  Time: ${sw.stop()} seconds.`);
  } else {
    appInfo(`Pulled: 'none'\n  Time: ${sw.stop()} seconds.`);
  }

  PULLING_DATA = false;
}

(async () => {
  // Make the connection to the mongo database.
  await mongoose.connect(`mongodb://localhost/${DB_DATABASE}`);

  // Make the connection to the sql database.
  await CandleDb.spawnConnection();

  // Update the timestamp to a 'nice' number.
  const ts = setToZero(new Date(), PULL_OPTS.mUpdateFrequency);
  PULL_OPTS.setEnd(ts);

  // Load all of the products and currencies.
  await initProduct();
  await initCurrency();

  // Run on periods of the frequency provided.
  const cronSchedule = `*/${PULL_OPTS.mUpdateFrequency} * * * *`;
  if (!validate(cronSchedule)) {
    throw new Error(`invalid cron schedule provided: '${cronSchedule}'`);
  }

  appInfo(`update period of ${PULL_OPTS.mUpdateFrequency} min currently set.`);
  schedule(cronSchedule, pullData);

  // Pull the first of our data.
  await pullData();
})().catch(async (err) => {
  let errMsg = 'unknown error';
  if (err.response) {
    errMsg = `${err.response.status}: ${err.response.data.message}`;
  } else if (err instanceof Error) errMsg = err.message;
  else errMsg = err;

  appErr(`\n\nexiting application: ${errMsg}`);
  await killAll();
});
