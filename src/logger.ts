import {stdout, stderr} from 'process';
import {APP_DEBUG, DbCompat} from '.';
import {LogModel, LogSchema} from './models/log';
import {ObjectId} from 'bson';
import {createMessage, Destination, MDSRVClient, Status} from 'mdsrv-client';
import {config as envLoad} from 'dotenv';

// MDSRV connection.
envLoad();
const MDSRV_DISCORD_DEST = process.env.MDSRV_DISCORD_DEST ?? '';
const mdsrvClient = new MDSRVClient();

const RED: string = '\x1b[31m';
const GREEN: string = '\x1b[32m';
const YELLOW: string = '\x1b[33m';
const BLUE: string = '\x1b[34m';
const RESET: string = '\x1b[0m';

let lastLength: number = 0;

/**
 * Log text to console.
 *
 * @param {string} type - Specifies error, info, debug, warn, or log.
 * @param {string} header - Location the log is coming from (optional.)
 * @param {string} text - Text to display to the console.
 * @param {string} footer - How to end the log, default is a newline.
 * @param {boolean} debug - Overrides the DEBUG value with this one.
 */
export function logger(
  type: string,
  header: string,
  text: string,
  footer: string = '\n',
  debug?: boolean,
) {
  // Get the amount to pad.
  let padCount: number = 0;
  for (const ch of text) {
    if (ch === '\n') padCount++;
    else break;
  }

  // Create the padding.
  const pad: string = '\n'.repeat(padCount);
  text = text.slice(padCount);
  const baseText: string = text.trim();

  // Add the optional header.
  const baseHeader = header;
  if (header !== '') header = `: ${header}`;

  // Pad with white space at the end.
  text = `[${type}${header}] ${text}`;
  const data = `${pad}${text.padEnd(lastLength)}${footer}`;
  lastLength = text.length;

  switch (type) {
    case 'error':
      if (baseHeader !== 'user') mdsrvSend(Status.ERROR, baseText);
      stderr.write(`${RED}${data}${RESET}`);
      break;
    case 'debug':
      if (!(debug !== undefined ? debug : APP_DEBUG)) return;
      stdout.write(`${BLUE}${data}${RESET}`);
      break;
    case 'warn':
      stdout.write(`${YELLOW}${data}${RESET}`);
      break;
    case 'info':
    case 'log':
    default:
      stdout.write(data);
  }

  if (footer === '\n' && type !== 'debug') {
    newLog(type, baseHeader, baseText);
  }
}

async function mdsrvSend(status: Status, data: string) {
  const msg = createMessage(
    'coeus',
    'logger',
    Destination.DISCORD,
    MDSRV_DISCORD_DEST,
    status,
    data,
  );

  await mdsrvClient.sendMessage(msg).catch((err) => {
    stderr.write(
      `${RED}[error: logger] could not send message to MDSRV.${RESET}`,
    );
  });
}

interface Log extends LogSchema {}
class Log implements DbCompat {
  readonly _id: string = new ObjectId().toString();
  readonly created: string = new Date().toISOString();
  readonly type: string = '';
  readonly item: string = '';
  readonly message: string = '';

  constructor(type: string, item: string, message: string) {
    this.type = type;
    this.item = item;
    this.message = message;

    this.save();
  }

  /**
   * Saves the log to the database.
   */
  async save() {
    await LogModel.updateOne({_id: this._id}, this, {upsert: true});
  }

  /**
   * Delete the log.
   */
  async remove() {
    // Remove from database.
    await LogModel.deleteOne({_id: this._id});
  }
}

/**
 * Creates a user.
 *
 * @param {boolean} isCore - Options: Create the core user.
 */
export function newLog(type: string, item: string, message: string): Log {
  return new Log(type, item, message);
}
