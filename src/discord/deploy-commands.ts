import fs from 'fs';
import {REST} from '@discordjs/rest';
import {Routes} from 'discord-api-types/v9';
import {config as envLoad} from 'dotenv';
import {discordErr, discordInfo} from '.';

// Load the environment variables into process.env
envLoad();

const DISCORD_TOKEN: string = process.env.DISCORD_TOKEN ?? '';
const DISCORD_ID: string = process.env.DISCORD_ID ?? '';
const DISCORD_GUILD: string = process.env.DISCORD_GUILD ?? '';

const commands = [];
const commandFiles = fs
  .readdirSync('./dist/discord/commands')
  .filter((file: string) => file.endsWith('.js'));

// Add the commands to the array.
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

// Create a rest client to post the new commands.
const rest = new REST({version: '10'}).setToken(DISCORD_TOKEN);

(async () => {
  try {
    // Add commands.
    await rest.put(Routes.applicationGuildCommands(DISCORD_ID, DISCORD_GUILD), {
      body: commands,
    });

    discordInfo('Successfully registered application commands.');
  } catch (err) {
    discordErr(`${err}`);
  }
})();
