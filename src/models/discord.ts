import mongoose from 'mongoose';

const {Schema, model} = mongoose;

export interface DiscordConfig {
  guild: string;
  admins: string[];
  messages: string[];
}

const discordSchema = new Schema<DiscordConfig>(
  {
    guild: String,
    admins: [String],
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
