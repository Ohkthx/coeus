import fs from 'fs';
import {Collection, CommandInteraction} from 'discord.js';
import {SlashCommandBuilder} from '@discordjs/builders';
import {discordErr, LastCommand} from '..';

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: CommandInteraction) => void;
}

// Contains all of the currently created commands.
const commands: Collection<string, Command> = new Collection();
const commandFiles = fs
  .readdirSync('./dist/discord/commands')
  .filter((file: string) => file.endsWith('.js'));

// Add the commands to a map for later access.
for (const file of commandFiles) {
  const command = require(`../commands/${file}`);
  commands.set(command.data.name, command);
}

/**
 * Called when the interactionCreate event happens, resolves the correct command
 * and processes it.
 */
module.exports = {
  name: 'interactionCreate',
  async execute(interaction: CommandInteraction) {
    try {
      if (!interaction.isCommand()) return;

      if (interaction.commandName !== 'last') {
        // Set this interaction to the last interaction performed.
        LastCommand.set(interaction.user.id, interaction);
      }

      // Get the command from the collection.
      const command = commands.get(interaction.commandName);
      if (!command) return;

      // Process the command.
      command.execute(interaction);
    } catch (err) {
      discordErr(`Could not process interaction: '${interaction.commandName}'`);
      return interaction.reply({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      });
    }
  },
};
