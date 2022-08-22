import fs from 'fs';
import {
  Command,
  COMMANDS_CURRENT_VERSION,
  COMMANDS_FILE_NAME,
  consoleErr,
  newResponse,
  Response,
  Event,
} from '.';

// Contains all of the event endpoints.
let EVENTS: {[id: string]: Event} = {};

// Contains a list of all created commands.
let COMMANDS: Command[] = [];

export class ConsoleState {
  static isReloading: boolean = false;

  /**
   * Gets all of the currently accessible commands.
   *
   * @param {boolean} enabledOnly - Optional: only returns enabled commands.
   * @returns {Command[]} An array of commands that exist.
   */
  static getCommands(enabledOnly?: boolean): Command[] {
    let commands = COMMANDS ?? [];
    if (enabledOnly !== undefined && enabledOnly === true) {
      commands = commands.filter((c) => c.isEnabled === true);
    }

    return commands;
  }

  /**
   * Gets a specific command by name.
   *
   * @param {string} name - Name / id of the command.
   * @returns {Command | undefined} Returns command if found, otherwise undefined.
   */
  static getCommand(name: string): Command | undefined {
    return ConsoleState.getCommands().find((c) => c.name === name);
  }

  /**
   * Fix a command by assigning known defaults to it.
   * This can help prevent bad actors from changing access rights.
   *
   * @param {Command} cmd - Command to fix.
   * @returns {Command | undefined} Returns fixed command, undefined if invalid.
   */
  static getFix(cmd: Command): Command | undefined {
    const local = ConsoleState.getCommand(cmd.name);
    if (!local) return;

    // Remove duplicate params if they exist.
    cmd.params = [...new Set(cmd.params)];

    return {
      name: local.name,
      params: cmd.params,
      dataObj: cmd.dataObj,
      isEnabled: local.isEnabled,
      description: local.description,
      usage: local.usage,
      created: cmd.created ?? local.created,
      v: local.v,
    };
  }

  /**
   * Parses command and performs the desired action if all is valid.
   *
   * @param {Command} cmd - Command to perform and action with.
   * @returns {Response} Response indicating what modifications happened, if any.
   */
  static async parse(cmd: Command): Promise<Response> {
    const fixedCmd = ConsoleState.getFix(cmd);
    if (!fixedCmd) {
      return newResponse(404, 'invalid command');
    }

    // Corrected and sanitized command.
    cmd = fixedCmd;
    if (!cmd.isEnabled) {
      // Do not process disabled commands.
      return newResponse(403, 'command is disabled');
    }

    // Check if a binding exists for the event.
    const event = EVENTS[cmd.name];
    if (!event) {
      return newResponse(501, `'${cmd.name}' not implemented`);
    }

    try {
      const res = await event.execute(cmd);
      return res;
    } catch (err) {
      if (err instanceof Error) {
        consoleErr(err.message);
        return newResponse(404, `error occurred, ${err.message}`);
      } else consoleErr(`unknown error, ${err}`);
      return newResponse(
        404,
        'unknown error occurred, please check your command.',
      );
    }
  }

  /**
   * Extract data from a command.
   *
   * @param {Command} cmd - Command to extract data from.
   * @returns {object} Data converted to an object.
   */
  static extractData(cmd: Command): object {
    let data: object | undefined;
    if (cmd.dataObj === '') {
      throw new Error('data is empty.');
    }

    try {
      // Convert from JSON string to object.
      data = JSON.parse(cmd.dataObj);
    } catch (_err) {
      throw new Error('could not extract data from command');
    }

    if (data === undefined) {
      throw new Error('data is empty.');
    }

    return data;
  }

  /**
   * Loads both the commands and events for console access.
   *  commands - Instructions for the server to perform.
   *  events - acts out commands actions.
   */
  static loadAll() {
    if (ConsoleState.isReloading) return;
    ConsoleState.isReloading = true;

    // Load the commands and events from file.
    loadCommands();
    loadEvents();
    ConsoleState.isReloading = false;
  }
}

/**
 * Loads all of the events. Commands align with an event and trigger it.
 */
function loadEvents() {
  // Contains all of the currently created events.
  const eventFiles = fs
    .readdirSync('./dist/commands/events')
    .filter((file: string) => file.endsWith('.js'));

  // Add the events to their respected handlers.
  for (const file of eventFiles) {
    const event = require(`./events/${file}`);

    EVENTS[event.name] = event;
  }
}

/**
 * Loads all commands from file, if the file does not exist, it creates it
 * with a default 'example' command.
 */
function loadCommands() {
  let cmd: Command[] = [];

  // Create the commands file if it does not exist.
  if (!fs.existsSync(COMMANDS_FILE_NAME)) {
    cmd = [exampleCommand];
    fs.writeFileSync(COMMANDS_FILE_NAME, JSON.stringify(cmd, null, 2));
    COMMANDS = cmd;
    return;
  }

  // Load the file.
  try {
    const data = fs.readFileSync(COMMANDS_FILE_NAME);
    cmd = JSON.parse(data.toString());
  } catch (_err) {
    consoleErr(`could not load commands file, error reading data`);
  }
  if (!cmd) cmd = [];

  // Check the versions for all of the commands.
  for (const c of cmd) {
    if (c.v !== COMMANDS_CURRENT_VERSION) {
      throw new Error(
        `version mismatch for command '${c.name}', ` +
          `current: ${COMMANDS_CURRENT_VERSION}, received: ${c.v}`,
      );
    }
  }

  COMMANDS = cmd;
}

const exampleCommand: Command = {
  name: 'example',
  params: [],
  dataObj: '',
  isEnabled: true,
  description: ['Example of a command, this actually does nothing.'],
  usage: 'example [param1] [param2] ...',
  created: new Date().toISOString(),
  v: COMMANDS_CURRENT_VERSION,
};
