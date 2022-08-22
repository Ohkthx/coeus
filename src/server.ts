import {DynamicState, StateConfig} from './core';
import {delay} from './utils';
import {connect} from 'mongoose';
import {ConsoleState} from './commands';
import {HTTPServer} from './rest';
import {APP_DEBUG, DB_DATABASE, USE_SANDBOX, appInfo, appErr, appWarn} from '.';

appInfo(`APP_DEBUG set to '${APP_DEBUG}'`);
appInfo(`DB_DATABASE set to '${DB_DATABASE}'`);
appInfo(`USE_SANDBOX set to '${USE_SANDBOX}'`);

// DynamicState Settings.
const DYNAMIC_OPTS: StateConfig = {
  periodSpan: 14, // in DAYS.
  candleSize: 5, // in MINUTES.
  bucketSize: 3, // amount per bucket.
  intervals: 6, // amount of intervals to process.
  rankKeep: 50, // Top # to keep in rankings.
};

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
  DynamicState.disable();
  if (DynamicState.isUpdating) {
    appInfo('[Dynamic Algorithm] currently updating... waiting.');
    while (DynamicState.isUpdating) await delay(250);
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
  await DynamicState.initWrapper(DYNAMIC_OPTS);

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
