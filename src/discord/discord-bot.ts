import {
  Channel,
  Client,
  EmbedBuilder,
  IntentsBitField,
  Message,
  TextChannel,
} from 'discord.js';
import {config as envLoad} from 'dotenv';
import {DISCORD_MAX_RANKING} from '.';
import {DiscordConfig, DiscordModel} from '../models/discord';
import {delay, isArray, isText} from '../utils';
import {createNotification, NULL_DATA} from './notification';

// Load the environment variables into process.env
envLoad();

const DISCORD_TOKEN: string = process.env.DISCORD_TOKEN ?? '';
const DISCORD_HANDLE: string = process.env.DISCORD_HANDLE ?? 'COEUS';
export const DISCORD_DEST_RANK = process.env.DISCORD_DEST_RANK ?? '';
export const DISCORD_DEST_ANALYSIS = process.env.DISCORD_DEST_ANALYSIS ?? '';

export class DiscordBot {
  private static client: Client<true> | undefined;
  private static ready: boolean = false;
  private static timeoutSet: boolean = false;
  private static lastMessage: number = Date.now();
  private static config: DiscordConfig;

  private static async initDiscordBot() {
    // Do not continue to intialize if we already have.
    if (DiscordBot.client && DiscordBot.ready) return;

    // Check if the token is valid.
    if (DISCORD_TOKEN === '') {
      throw new Error(
        `'DISCORD_TOKEN' is not set in '.env' file, please set it before using this feature.`,
      );
    }

    // Set the client with a limited scope.
    const client = new Client({
      intents: [IntentsBitField.Flags.DirectMessages],
    });

    try {
      client.once('ready', (client: Client<true>) => {
        DiscordBot.client = client;
        DiscordBot.ready = true;
      });

      // Login and wait for the bot to be ready.
      client.login(DISCORD_TOKEN);
      while (!DiscordBot.ready) {
        await delay(250);
      }
    } catch (error: any) {
      throw new Error(
        `unable to establish discord connection, check the discord token`,
      );
    }
  }

  private static async timeout() {
    if (!DiscordBot.timeoutSet) return;

    if (Date.now() - DiscordBot.lastMessage >= 30000) {
      DiscordBot.client?.destroy();
      DiscordBot.client = undefined;
      DiscordBot.ready = false;
      DiscordBot.timeoutSet = false;
    } else {
      setTimeout(DiscordBot.timeout, 60000);
    }
  }

  private static async validateSession(
    discordId: string,
  ): Promise<TextChannel> {
    await DiscordBot.initDiscordBot();

    // Cannot send notification if the client is unassigned.
    const client = DiscordBot.client?.user;
    if (!client) {
      throw new Error('could not obtain discord bots user account.');
    }

    // Attempt to find the receiving channel.
    let channel: Channel | null | undefined;
    try {
      channel = await DiscordBot.client?.channels
        .fetch(discordId)
        .then((ch) => {
          return ch;
        })
        .catch((err) => {
          throw err;
        });
    } catch (err) {
      throw new Error(
        `could not resolve discord channel by id, '${discordId}'.`,
      );
    }

    if (!channel || !channel.isTextBased()) {
      throw new Error(`invalid channel type, needs to be a text channel.`);
    }

    // Update our timer.
    DiscordBot.lastMessage = Date.now();
    if (!DiscordBot.timeoutSet) {
      setTimeout(DiscordBot.timeout, 60000);
      DiscordBot.timeoutSet = true;
    }

    return <TextChannel>channel;
  }

  private static async getMessage(
    discordId: string,
    messageId: string,
  ): Promise<Message<true> | undefined> {
    return DiscordBot.validateSession(discordId)
      .then(async (channel) => {
        return channel.messages
          .fetch(messageId)
          .then((msg) => {
            return msg;
          })
          .catch(() => {
            return undefined;
          });
      })
      .catch((err) => {
        console.log(err.message);
        return undefined;
      });
  }

  static async setActivity(activity: string) {
    await DiscordBot.initDiscordBot();

    // Cannot send notification if the client is unassigned.
    const client = DiscordBot.client?.user;
    if (!client) {
      throw new Error('could not obtain discord bots user account.');
    }

    return client.setActivity(activity);
  }

  /**
   * Send a notification in the form of an embed to discord.
   *
   * @param {string} discordId - id of the discord channel
   * @param {EmbedBuilder | EmbedBuilder[]} embed - Embed to send
   */
  static async sendNotification(
    discordId: string,
    embed: string | EmbedBuilder | EmbedBuilder[],
  ): Promise<Message<true> | Message<false> | undefined> {
    return DiscordBot.validateSession(discordId)
      .then(async (channel) => {
        if (isText(embed)) {
          return channel.send(embed);
        } else if (isArray(embed)) {
          // Send all embeds if it is an array.
          return channel.send({embeds: <EmbedBuilder[]>embed});
        }
        // Send single embed.
        return channel.send({embeds: [<EmbedBuilder>embed]});
      })
      .catch((err) => {
        console.log(err.message);
        return undefined;
      });
  }

  static async editNotification(
    discordId: string,
    messageId: string,
    embed: string | EmbedBuilder | EmbedBuilder[],
  ): Promise<Message<true> | Message<false> | undefined> {
    const msg = await DiscordBot.getMessage(discordId, messageId);
    if (!msg) {
      // Create a message.
      const msg = await DiscordBot.sendNotification(discordId, embed);
      if (!msg) throw new Error(`could not get message from notification.`);

      // Remove the old messageId.
      const msgIds = DiscordBot.messageIds;
      const index = msgIds.findIndex((m) => m === messageId);
      if (index >= 0) msgIds.splice(index, 1);

      msgIds.push(msg.id);
      await DiscordBot.saveConfig(msgIds);

      return msg;
    }

    try {
      if (isText(embed)) {
        return msg.edit(embed);
      } else if (isArray(embed)) {
        // Send all embeds if it is an array.
        return msg.edit({embeds: <EmbedBuilder[]>embed});
      } else {
        // Send single embed.
        return msg.edit({embeds: [<EmbedBuilder>embed]});
      }
    } catch (err) {
      throw new Error(
        'could not send message to channel, make sure it is the correct channel.',
      );
    }
  }

  static get messageIds(): string[] {
    return DiscordBot.config.messages;
  }

  static async saveConfig(messageIds: string[]) {
    const config = DiscordBot.config;
    config.messages = messageIds;

    await DiscordModel.updateOne({handle: config.handle}, config, {
      upsert: true,
    });
  }

  static async loadConfig() {
    DiscordBot.config = (await DiscordModel.findOne({}, null, {
      lean: true,
    })) as DiscordConfig;
    if (!DiscordBot.config) {
      // create a dummy configuration.
      DiscordBot.config = {
        handle: DISCORD_HANDLE,
        channels: {
          rank: DISCORD_DEST_RANK,
          analysis: DISCORD_DEST_ANALYSIS,
        },
        messages: [],
      };
    }

    // Create any missing messages if they do not exist.
    if (DiscordBot.messageIds.length < DISCORD_MAX_RANKING + 1) {
      const msgIds: string[] = DiscordBot.messageIds;

      for (const msgId of msgIds) {
        const msg = await DiscordBot.getMessage(
          DiscordBot.config.channels.rank,
          msgId,
        );
        if (!msg) {
          // Remove the old messageId.
          const index = msgIds.findIndex((m) => m === msgId);
          if (index >= 0) msgIds.splice(index, 1);
        }
      }

      const missing = DISCORD_MAX_RANKING + 1 - msgIds.length;
      for (let i = 0; i < missing; i++) {
        const newMsg = createNotification('json', NULL_DATA);
        const msg = await DiscordBot.sendNotification(
          DiscordBot.config.channels.rank,
          newMsg,
        );

        if (msg) msgIds.push(msg.id);
      }

      await DiscordBot.saveConfig(msgIds);
    }
  }
}
