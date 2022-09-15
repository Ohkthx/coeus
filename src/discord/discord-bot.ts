import {
  Client,
  EmbedBuilder,
  IntentsBitField,
  Message,
  TextChannel,
} from 'discord.js';
import {discordErr} from '.';
import {DiscordConfig, DiscordModel} from '../models/discord';
import {delay, isArray, isText} from '../utils';
import {createNotification, PLACEHOLDER_DATA} from './notification';
import {config as envLoad} from 'dotenv';

interface DiscordOpts {
  appId: string;
  appToken: string;
  handle: string;
  guild: string;
  admins: string[];
  analysis: {
    dest: string;
  };
  ranking: {
    dest: string;
    messages: string[];
    max: number;
  };
}

export const DISCORD_OPTS: DiscordOpts = {
  appId: '',
  appToken: '',
  handle: '',
  guild: '',
  admins: [],
  analysis: {dest: ''},
  ranking: {dest: '', messages: [], max: 5},
};

// Load the environment variables into process.env
envLoad();

const admins = process.env.DISCORD_ADMINS ?? '';
DISCORD_OPTS.admins = admins.split(',');
DISCORD_OPTS.appToken = process.env.DISCORD_TOKEN ?? '';
DISCORD_OPTS.handle = process.env.DISCORD_HANDLE ?? 'COEUS';
DISCORD_OPTS.guild = process.env.DISCORD_GUILD ?? '';
DISCORD_OPTS.ranking.dest = process.env.DISCORD_DEST_RANK ?? '';
DISCORD_OPTS.analysis.dest = process.env.DISCORD_DEST_ANALYSIS ?? '';

export class DiscordBot {
  private static client: Client<true> | undefined;
  private static ready: boolean = false;
  private static timeoutSet: boolean = false;
  private static lastMessage: number = Date.now();
  private static mode: 'server' | 'push' = 'server';

  /**
   * Initializes the Discord Bot in either 'server' or 'push' mode.
   *  'server' - Bot will stay alive until requested to shutdown.
   *  'push' - Bot will stay alive only temporarily, not good for taking commands.
   *
   * @param {'server' | 'push'} mode - Mode to initialize into.
   */
  static async init(mode: 'server' | 'push'): Promise<boolean> {
    DiscordBot.mode = mode;
    let success: boolean = false;
    if (mode === 'push') success = await DiscordBot.initPushBot();
    else success = await DiscordBot.initServerBot();

    if (!success) return false;

    await DiscordBot.loadConfig();
    return true;
  }

  /**
   * Initializes the Discord Bot as a 'push' bot. Staying alive only temporarily.
   */
  private static async initPushBot(): Promise<boolean> {
    // Do not continue to intialize if we already have.
    if (DiscordBot.client && DiscordBot.ready) return true;

    // Check if the token is valid.
    if (DISCORD_OPTS.appToken === '') {
      throw new Error(
        `'DISCORD_TOKEN' is not set in '.env' file, please set it before using this feature.`,
      );
    }

    // Set the client with a limited scope.
    const client = new Client({
      intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.DirectMessages,
      ],
    });

    try {
      client.once('ready', (client: Client<true>) => {
        DiscordBot.client = client;
        DiscordBot.setReady(true);
      });

      // Login and wait for the bot to be ready.
      await client.login(DISCORD_OPTS.appToken);
      while (!DiscordBot.ready) await delay(250);
    } catch (err) {
      discordErr(
        `unable to establish discord connection, check the discord token`,
      );
      return false;
    }

    return true;
  }

  /**
   * Initializes the Discord Bot as a 'server' bot. Staying alive permanently.
   */
  private static async initServerBot(): Promise<boolean> {
    // Do not continue to intialize if we already have.
    if (DiscordBot.client && DiscordBot.ready) return true;

    const client = new Client({
      intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.DirectMessages,
      ],
    });

    // Contains all of the currently created event handlers.
    const fs = require('fs');
    const eventFiles = fs
      .readdirSync('./dist/discord/events')
      .filter((file: string) => file.endsWith('.js'));

    // Add the events to their respected handlers.
    try {
      for (const file of eventFiles) {
        const event = require(`./events/${file}`);
        if (event.once) {
          client.once(event.name, (...args: any[]) => event.execute(...args));
        } else {
          client.on(event.name, (...args: any[]) => event.execute(...args));
        }
      }

      // Log the client in and wait for it to be ready.
      await client.login(DISCORD_OPTS.appToken);
      while (!DiscordBot.ready) await delay(250);
      DiscordBot.client = client;
    } catch (err) {
      discordErr(
        `unable to establish discord connection, check the discord token`,
      );
      return false;
    }

    return true;
  }

  /**
   * Used for 'push' mode, shuts the bot down after time has elapsed.
   */
  private static async timeout() {
    if (!DiscordBot.timeoutSet || DiscordBot.mode === 'server') return;

    if (Date.now() - DiscordBot.lastMessage >= 30000) {
      DiscordBot.client?.destroy();
      DiscordBot.client = undefined;
      DiscordBot.ready = false;
      DiscordBot.timeoutSet = false;
    } else {
      setTimeout(DiscordBot.timeout, 60000);
    }
  }

  /**
   * Sets the activity for the bot.
   *
   * @param {string} activity - Status message to set.
   */
  static setActivity(activity: string) {
    if (!DiscordBot.client) {
      discordErr(`discord client needs to be initialized first.`);
      return;
    }

    try {
      DiscordBot.client.user.setActivity(activity);
    } catch (err) {
      discordErr(`could not set activity.`);
    }
  }

  /**
   * Sets the name of bot.
   *
   * @param {string} name - Name to be renamed to.
   */
  static setNick(name: string) {
    if (!DiscordBot.client) {
      discordErr(`discord client needs to be initialized first.`);
      return;
    }

    try {
      DiscordBot.client.user.setUsername(name);
    } catch (err) {
      discordErr(`could not set name.`);
    }
  }

  /**
   * Sets the Discord Bots ready status.
   *
   * @param {boolean} ready - Value to set to.
   */
  static setReady(ready: boolean) {
    DiscordBot.ready = ready;
  }

  /**
   * Get a channel from the API, ensuring it exists.
   *
   * @param {string} channelId - Id of the channel.
   * @returns {Promise<TextChannel | undefined>} Text channel, if found.
   */
  private static async getChannel(
    channelId: string,
  ): Promise<TextChannel | undefined> {
    if (!DiscordBot.client) {
      discordErr(`discord client needs to be initialized first.`);
      return;
    }

    // Attempt to find the receiving channel.
    let channel: TextChannel | undefined;
    try {
      const ch = await DiscordBot.client.channels.fetch(channelId);
      if (!ch) {
        discordErr(`channel could not be resolved: ${channelId}`);
        return;
      }

      if (!ch.isTextBased()) {
        discordErr(`invalid channel type, needs to be a text channel.`);
        return;
      }

      // Update our timer.
      DiscordBot.lastMessage = Date.now();
      if (!DiscordBot.timeoutSet) {
        setTimeout(DiscordBot.timeout, 60000);
        DiscordBot.timeoutSet = true;
      }

      channel = <TextChannel>ch;
    } catch (err) {
      discordErr(`could not resolve channel '${channelId}'`);
    }

    return channel;
  }

  /**
   * Retreives a message from Discord to check if it exists.
   *
   * @param {string} channelId - Channel Id the message belongs to.
   * @param {string} messageId - Id of the message being requested.
   * @returns {Promise<Message<true> | undefined} Message if found.
   */
  private static async getMessage(
    channelId: string,
    messageId: string,
  ): Promise<Message<true> | undefined> {
    let msg: Message<true> | undefined;
    try {
      const channel = await DiscordBot.getChannel(channelId);
      if (!channel || !channel.messages) return;

      msg = await channel.messages.fetch(messageId);
    } catch (err) {
      discordErr(`could not resolve message: '${messageId}'`);
    }

    return msg;
  }

  /**
   * Checks all messages to make sure they exist, recreates if not.
   */
  private static async checkMessageIntegrity() {
    // Validate the messages exist.
    const msgIds: string[] = [...DiscordBot.messageIds];
    for (const msgId of DiscordBot.messageIds) {
      const msg = await DiscordBot.getMessage(DISCORD_OPTS.ranking.dest, msgId);
      if (!msg) {
        // Remove the old messageId.
        const index = msgIds.findIndex((m) => m === msgId);
        if (index >= 0) msgIds.splice(index, 1);
      }
    }

    // Recreate the missing messages with placeholder data.
    const missing = DISCORD_OPTS.ranking.max + 1 - msgIds.length;
    for (let i = 0; i < missing; i++) {
      const newMsg = createNotification('json', PLACEHOLDER_DATA);
      const msg = await DiscordBot.sendNotification(
        DISCORD_OPTS.ranking.dest,
        newMsg,
      );

      if (msg) msgIds.push(msg.id);
    }

    DISCORD_OPTS.ranking.messages = msgIds;
    return DiscordBot.saveConfig();
  }

  /**
   * Send a notification in the form of an embed to discord.
   *
   * @param {string} channelId - Id of the discord channel.
   * @param {string | EmbedBuilder | EmbedBuilder[]} embed - Embed to send.
   * @returns {Promise<Message<true> | Message<false> | undefined>} Message sent.
   */
  static async sendNotification(
    channelId: string,
    embed: string | EmbedBuilder | EmbedBuilder[],
  ): Promise<Message<true> | undefined> {
    const channel = await DiscordBot.getChannel(channelId);
    if (!channel) return;

    let msg: Message<true> | undefined;
    try {
      if (isText(embed)) {
        // Send as a regular message if it is just a string.
        msg = await channel.send(embed);
      } else if (isArray(embed)) {
        // Send all embeds if it is an array.
        msg = await channel.send({embeds: <EmbedBuilder[]>embed});
      } else {
        // Send single embed.
        msg = await channel.send({embeds: [<EmbedBuilder>embed]});
      }
    } catch (err) {
      discordErr(`could not send message to channel '${channelId}'`);
    }

    return msg;
  }

  /**
   * Edits a discord message, replacing the message with the embed passed.
   *
   * @param {string} channelId - Id of the channel that the message belongs to.
   * @param {string} messageId - Id of the message to edit.
   * @returns {Promise<Message<true> | Message<false> | undefined>} Message edited.
   */
  static async editNotification(
    channelId: string,
    messageId: string,
    embed: string | EmbedBuilder | EmbedBuilder[],
  ): Promise<Message<true> | Message<false> | undefined> {
    let msg = await DiscordBot.getMessage(channelId, messageId);
    if (!msg) {
      // Remove the old messageId.
      const msgIds = [...DiscordBot.messageIds];
      const index = msgIds.findIndex((m) => m === messageId);
      if (index >= 0) msgIds.splice(index, 1);

      // Create a new message.
      msg = await DiscordBot.sendNotification(channelId, embed);
      if (!msg) {
        discordErr(`could not get recreated message.`);
        DISCORD_OPTS.ranking.messages = msgIds;
        await DiscordBot.saveConfig();
        return;
      }

      // Add the new message locally and to database.
      msgIds.push(msg.id);
      DISCORD_OPTS.ranking.messages = msgIds;
      await DiscordBot.saveConfig();

      return msg;
    }

    try {
      if (isText(embed)) {
        // Send as a regular message if it is just a string.
        msg = await msg.edit(embed);
      } else if (isArray(embed)) {
        // Send all embeds if it is an array.
        msg = await msg.edit({embeds: <EmbedBuilder[]>embed});
      } else {
        // Send single embed.
        msg = await msg.edit({embeds: [<EmbedBuilder>embed]});
      }
    } catch (err) {
      discordErr(
        'could not send message to channel, make sure it is the correct channel.',
      );
    }
    return msg;
  }

  /**
   * Shortcut for getting message Ids from DISCORD_OPTS.
   *
   * @returns {string[]} Messages Ids that are current accessible.
   */
  static get messageIds(): string[] {
    return DISCORD_OPTS.ranking.messages;
  }

  /**
   * Saves the current DISCORD_OPTS configuration to database.
   */
  static async saveConfig() {
    const config: DiscordConfig = {
      guild: DISCORD_OPTS.guild,
      admins: DISCORD_OPTS.admins,
      messages: DISCORD_OPTS.ranking.messages,
    };

    return DiscordModel.updateOne({guild: config.guild}, config, {
      upsert: true,
    });
  }

  /**
   * Loads a configuration from data into DISCORD_OPTS. Creates it if it does not exist.
   * Checks and verifies all of the messages that should exist, still do. Otherwise it
   * recreates them and updates the local database.
   */
  private static async loadConfig() {
    let config = (await DiscordModel.findOne({}, null, {
      lean: true,
    })) as DiscordConfig;
    if (config) {
      if (config.admins.length > 0) {
        DISCORD_OPTS.admins = config.admins;
      }

      if (config.messages.length > 0) {
        DISCORD_OPTS.ranking.messages = config.messages;
      }
    }

    await DiscordBot.checkMessageIntegrity();
  }
}
