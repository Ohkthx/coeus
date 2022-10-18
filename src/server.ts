import {ONE_DAY_TO_S, State} from './core';
import {delay} from './utils';
import {connect} from 'mongoose';
import {ConsoleState} from './commands';
import {HTTPServer} from './rest';
import {
  APP_DEBUG,
  DB_DATABASE,
  USE_SANDBOX,
  appInfo,
  appErr,
  appWarn,
  S_GRANULARITY,
  UPDATE_FREQUENCY,
  MAX_DAYS_OF_DATA,
} from '.';
import {DataOpts} from './core/opts';
import {DiscordBot} from './discord/discord-bot';
import {EmitServer} from './emitter';
import {CandleDb} from './sql';
import {Backtest, BacktestConfig, Strategy} from './backtest';
import {FileManager} from './file-manager';

const mUpdateTime = (S_GRANULARITY / 60) * UPDATE_FREQUENCY;
appInfo(`APP_DEBUG set to '${APP_DEBUG}'`);
appInfo(`DB_DATABASE set to '${DB_DATABASE}'`);
appInfo(`USE_SANDBOX set to '${USE_SANDBOX}'`);
appInfo(`UPDATE_FREQUENCY set to '${UPDATE_FREQUENCY}'`);
appInfo(`S_GRANULARITY set to '${S_GRANULARITY}'\n`);
appInfo(`Updates set to every ${mUpdateTime} minutes.`);

const CANDLES_PER_BUCKET: number = ONE_DAY_TO_S / S_GRANULARITY;
const DATA_OPTS = new DataOpts(
  new Date(), // Time to end at.
  {
    frequency: UPDATE_FREQUENCY, // Amount of candles to wait between updates.
    sGranularity: S_GRANULARITY, // Size of each candle in seconds.
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

  // Wait for candles to be done saving and kill the SQL database connection.
  if (CandleDb.isSaving()) {
    appInfo('[candles] currently saving candles... waiting.');
    while (CandleDb.isSaving()) await delay(250);
    await CandleDb.killConnection();
    appInfo('[candles] saved.');
  }

  // Wait for files to finish deleting.
  if (FileManager.isDelayDeletion()) {
    appInfo('[file-manager] currently deleting files... waiting.');
    FileManager.forceDeletionAll();
    appInfo('[file-manager] deleting complete.');
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

async function testFeature(): Promise<boolean> {
  // Try backtest.
  const strat: Strategy = {
    readjustRate: 0.02,
    buyRates: [0.005, 0.01, 0.02, 0.03, 0.04],
    sellRate: 0.01,
    sizeBase: 0.0001,
    sizeGrowth: 2.5,
    cutLoss: 0.1,
  };

  const pIds: string[] = ['BTC-USD', 'ETH-USD']; //, 'ADA-USD'];
  const mins: number[] = [0.0001, 0.001, 1];
  console.log(`Backtest Results:`);
  for (let i = 0; i < pIds.length; i++) {
    strat.sizeBase = mins[i];
    const conf: BacktestConfig = {
      productId: pIds[i],
      startISO: DATA_OPTS.start.toISOString(),
      strategy: strat,
      funds: 1000,
    };

    const backtest = new Backtest(conf);
    const res = await backtest.start();
    console.log(JSON.stringify(res, null, 2));
  }

  return true;
}

(async () => {
  // Make the connection to the mongo database.
  await connect(`mongodb://localhost/${DB_DATABASE}`);

  // Make the connection to the sql database.
  await CandleDb.spawnConnection();

  // Initialize the Emit Server, but do not start yet.
  EmitServer.init();

  // Load the console commands and events.
  ConsoleState.loadAll();

  // Load the Discord Config.
  await DiscordBot.init('server');

  //const quitEarly = await testFeature();
  //if (quitEarly) await killAll();

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
