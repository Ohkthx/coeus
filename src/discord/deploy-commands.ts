import fs from 'fs';
import {REST} from '@discordjs/rest';
import {Routes} from 'discord-api-types/v9';
import {discordErr, discordInfo} from '.';
import {DISCORD_OPTS} from './discord-bot';

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
const rest = new REST({version: '10'}).setToken(DISCORD_OPTS.appToken);

discordInfo(`App Id: ${DISCORD_OPTS.appId}`);
discordInfo(`Guild Id: ${DISCORD_OPTS.guild}`);
discordInfo('Registering application commands.');

(async () => {
  // Add commands to the guild it is in.
  await rest.put(
    Routes.applicationGuildCommands(DISCORD_OPTS.appId, DISCORD_OPTS.guild),
    {
      body: commands,
    },
  );

  discordInfo('Successfully registered application commands.');
})()
  .catch((err) => {
    discordErr(`Unable to register commands:\n${err}`);
  })
  .finally(() => {
    process.exit();
  });
