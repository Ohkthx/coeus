import {
  CANDLE_GRANULARITY,
  isSavingCandles,
  MAX_DAYS_OF_DATA,
  ONE_DAY_TO_S,
  State,
} from './core';
import {delay} from './utils';
import {connect} from 'mongoose';
import {ConsoleState} from './commands';
import {HTTPServer} from './rest';
import {APP_DEBUG, DB_DATABASE, USE_SANDBOX, appInfo, appErr, appWarn} from '.';
import {DataOpts} from './core/opts';
import {DiscordBot} from './discord/discord-bot';
import {EmitServer} from './emitter';

appInfo(`APP_DEBUG set to '${APP_DEBUG}'`);
appInfo(`DB_DATABASE set to '${DB_DATABASE}'`);
appInfo(`USE_SANDBOX set to '${USE_SANDBOX}'`);

const CANDLES_PER_BUCKET: number = ONE_DAY_TO_S / CANDLE_GRANULARITY;

const DATA_OPTS = new DataOpts(
  new Date(), // Time to end at.
  {
    granularity: CANDLE_GRANULARITY, // Size of each candle in seconds.
    pullNew: true, // Pull new candle data or not.
  },
  {
    candlesPer: CANDLES_PER_BUCKET, // Amount of candles per bucket.
    total: MAX_DAYS_OF_DATA, // Amount of buckets.
  },
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
  // Disable the core.
  State.disable();
  if (State.isUpdating) {
    appInfo('[core] currently updating... waiting.');
    while (State.isUpdating) await delay(250);
  }
  appInfo('[core] disabled.');

  // Wait for candles to be done saving.
  if (isSavingCandles()) {
    appInfo('[candles] currently saving candles... waiting.');
    while (isSavingCandles()) await delay(250);
    appInfo('[candles] saved.');
  }

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

  // Initialize the Emit Server, but do not start yet.
  EmitServer.init();

  // Load the console commands and events.
  ConsoleState.loadAll();

  // Load the Discord Config.
  await DiscordBot.init('server');

  // Initialize the core.
  await State.initWrapper(DATA_OPTS);

  // Start the EMIT server.
  EmitServer.enable();

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
