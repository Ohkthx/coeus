import mongoose from 'mongoose';

const {Schema, model} = mongoose;

export interface DiscordConfig {
  handle: string;
  channels: {
    rank: string;
    analysis: string;
  };
  messages: string[];
}

const discordSchema = new Schema<DiscordConfig>(
  {
    handle: String,
    channels: {
      rank: String,
      analysis: String,
    },
    messages: [String],
  },
  {collection: 'discord'},
);

/**
 * Model that represents discords config.
 */
export const DiscordModel = model<DiscordConfig>(
  'DiscordConfig',
  discordSchema,
);
