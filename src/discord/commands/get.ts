import {
  bold,
  codeBlock,
  CommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import {State} from '../../core';
import {ProductData} from '../../core/product-data';
import {Currencies} from '../../currency';
import {FileManager} from '../../file-manager';
import {Products} from '../../product';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('get')
    .setDescription('Retrieving info commands.')
    .addSubcommand((subcmd) =>
      subcmd
        .setName('rank')
        .setDescription('retrieve a rank.')
        .addStringOption((option) =>
          option
            .setName('product')
            .setDescription('Id of the product/pair, ie. BTC-USD')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcmd) =>
      subcmd
        .setName('product')
        .setDescription('retrieve a product.')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Id of the product/pair, ie. BTC-USD')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcmd) =>
      subcmd
        .setName('currency')
        .setDescription('retrieve a currency.')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Id of the currency, ie. BTC')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcmd) =>
      subcmd
        .setName('indicators')
        .setDescription('retrieve a products indicators.')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Id of the product/pair, ie. BTC-USD')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcmd) =>
      subcmd
        .setName('update')
        .setDescription('Gives you the current Update Id.'),
    )
    .addSubcommand((subcmd) =>
      subcmd
        .setName('filter')
        .setDescription('Gives you the current filter for rank results.'),
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) {
      return interaction.reply({
        content: `This is not a chat input command.`,
        ephemeral: true,
      });
    }

    switch (interaction.options.getSubcommand()) {
      case 'rank':
        return getRank(interaction);
      case 'product':
        return getProduct(interaction);
      case 'currency':
        return getCurrency(interaction);
      case 'indicators':
        return getIndicators(interaction);
      case 'update':
        return getUpdate(interaction);
      case 'filter':
        return getFilter(interaction);
      default:
        return interaction.reply({
          content: `Unknown get command.`,
          ephemeral: true,
        });
    }
  },
};

function getRank(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return interaction.reply({
      content: `This is not a chat input command.`,
      ephemeral: true,
    });
  }

  const opts = interaction.options;
  const productId = opts.getString('product', true) ?? '';
  const rank = State.getRanking(productId.toUpperCase());
  if (productId === '' || !rank) {
    return interaction.reply({
      content:
        `Attempted to get an invalid rank: ${productId}. ` +
        `Could be disabled, delisted, non-existent, or typo'd.`,
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: codeBlock('json', JSON.stringify(rank, null, 2)),
    ephemeral: false,
  });
}

function getProduct(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return interaction.reply({
      content: `This is not a chat input command.`,
      ephemeral: true,
    });
  }

  const opts = interaction.options;
  const productId = opts.getString('id', true) ?? '';
  const product = Products.get(productId.toUpperCase());
  if (productId === '' || !product) {
    return interaction.reply({
      content:
        `Attempted to get an invalid product: ${productId}. ` +
        `Could be disabled, delisted, non-existent, or typo'd.`,
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: codeBlock('json', JSON.stringify(product, null, 2)),
    ephemeral: false,
  });
}

function getCurrency(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return interaction.reply({
      content: `This is not a chat input command.`,
      ephemeral: true,
    });
  }

  const opts = interaction.options;
  const cId = opts.getString('id', true) ?? '';
  const currency = Currencies.get(cId.toUpperCase());
  if (cId === '' || !currency) {
    return interaction.reply({
      content:
        `Attempted to get an invalid currency: ${cId}. ` +
        `Could be disabled, delisted, non-existent, or typo'd.`,
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: codeBlock('json', JSON.stringify(currency, null, 2)),
    ephemeral: false,
  });
}

function getIndicators(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return interaction.reply({
      content: `This is not a chat input command.`,
      ephemeral: true,
    });
  }

  const opts = interaction.options;
  const productId = opts.getString('id', true) ?? '';
  const pData = ProductData.find(productId.toUpperCase());
  if (productId === '' || !pData) {
    return interaction.reply({
      content:
        `Attempted to get an invalid product: ${productId}. ` +
        `Could be disabled, delisted, non-existent, or typo'd.`,
      ephemeral: true,
    });
  }

  const fname = `Indicators-${pData.productId}.csv`;
  if (!FileManager.exists(`./${fname}`)) {
    // Generate the report since it does not exists.
    pData.indicatorsToCSV();
    FileManager.queueDeletion(`./${fname}`, 30000);
    return interaction.reply({
      content:
        `Indicators generated for product: ${pData.productId}.\n` +
        `Please call the same command again to get the report.\n` +
        `It will be automatically deleted in 30 seconds.`,
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: `Historical Data for: ${productId}`,
    files: [{attachment: `./${fname}`, name: fname}],
    ephemeral: false,
  });
}

function getUpdate(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return interaction.reply({
      content: `This is not a chat input command.`,
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: `Update Id: ${bold(State.updateId)}`,
    ephemeral: false,
  });
}

function getFilter(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return interaction.reply({
      content: `This is not a chat input command.`,
      ephemeral: true,
    });
  }

  let filter = JSON.stringify({none: 'no filters'}, null, 2);
  const stateFilter = State.getFilter();
  if (Object.entries(stateFilter).length > 0) {
    filter = JSON.stringify(stateFilter, null, 2);
  }

  return interaction.reply({
    content: codeBlock('json', filter),
    ephemeral: false,
  });
}
