import {State} from './core';
import {delay} from './utils';
import {connect} from 'mongoose';
import {ConsoleState} from './commands';
import {HTTPServer} from './rest';
import {APP_DEBUG, DB_DATABASE, USE_SANDBOX, appInfo, appErr, appWarn} from '.';
import {CandleOpts, ONE_DAY_TO_S} from './core/candle';
import {CandleGranularity} from 'coinbase-pro-node';

appInfo(`APP_DEBUG set to '${APP_DEBUG}'`);
appInfo(`DB_DATABASE set to '${DB_DATABASE}'`);
appInfo(`USE_SANDBOX set to '${USE_SANDBOX}'`);

const GRANULARITY: number = CandleGranularity.FIVE_MINUTES;
const CANDLES_PER_BUCKET: number = ONE_DAY_TO_S / GRANULARITY;
const MAX_BUCKETS: number = 300;

const CANDLE_OPTS = new CandleOpts(
  GRANULARITY, // Size of each candle in seconds.
  new Date(), // Time to end at.
  CANDLES_PER_BUCKET, // Amount of candles per bucket.
  MAX_BUCKETS, // Amount of buckets.
);

let sigintFired: number = 0; // Prevents spam messages from occurring.
process.on('SIGINT', async () => {
  sigintFired++;
  if (sigintFired > 1 && sigintFired < 5) return;
  else if (sigintFired >= 5) process.exit();

  appWarn('\n\nCaught interrupt signal');
  await killAll();
});

async function killAll() {
  // Disable the dynamic update algorithm.
  State.disable();
  if (State.isUpdating) {
    appInfo('[Dynamic Algorithm] currently updating... waiting.');
    while (State.isUpdating) await delay(250);
  }
  appInfo('[Dynamic Algorithm] disabled.');

  // Kill the HTTP server.
  HTTPServer.stop();
  if (HTTPServer.isActive) {
    appInfo('[REST Server] waiting to close.');
    while (HTTPServer.isActive) await delay(250);
  }
  appInfo('[REST Server] disabled.');

  process.exit();
}

(async () => {
  // Make the connection to the database.
  await connect(`mongodb://localhost/${DB_DATABASE}`);

  // Load the console commands and events.
  ConsoleState.loadAll();

  // Initialize the Dynamic Algorithm.
  await State.initWrapper(CANDLE_OPTS);

  // Start the REST server.
  await HTTPServer.start();
})().catch(async (err) => {
  let errMsg = 'unknown error';
  if (err.response) {
    errMsg = `${err.response.status}: ${err.response.data.message}`;
  } else if (err instanceof Error) errMsg = err.message;
  else errMsg = err;

  appErr(`\n\nexiting application: ${errMsg}`);
  await killAll();
});
