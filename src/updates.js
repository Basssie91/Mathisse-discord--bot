// ============================================================
//  UPDATES
//  Elke kleine wijziging aan de bot komt hier als nieuwe regel bij (onderaan).
//  Bij elke start plaatst de bot de updates die nog niet in het updatekanaal staan,
//  elk als een klein embed: "(Categorie): tekst", met het account van Bas eronder.
//  De bot kijkt in het kanaal zelf wat er al staat, dus niets wordt dubbel geplaatst.
//  Wijzig of verwijder geen regels die al geplaatst zijn (dan wordt hij opnieuw geplaatst).
// ============================================================
const {
  Events, EmbedBuilder, SlashCommandBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const cfg = require('./config');

const CHANNEL_ID = '1569359142722867467';
const AUTHOR_ID = '1057307298894196756'; // Bas: staat onder elke update
const COLOR = '#3B8BEB';

const updates = [
  ['Bot', 'De bot draait nu 24/7 op Bot-Hosting.'],
  ['Commands', 'Nieuw command /restart om de bot vanuit Discord te herstarten.'],
  ['Bot', 'De eigenaar krijgt een DM wanneer de server bij Bot-Hosting verlengd moet worden.'],
  ['Commands', 'Nieuw command /verlengen met de status van de verlenging.'],
  ['Tickets', 'Ticketpaneel met uitklapmenu toegevoegd: Vragen en Bestuur openen een privé ticket.'],
  ['Tickets', 'Staff sollicitaties gaan nu via een formulier in het ticketmenu.'],
  ['Tickets', 'Partneraanvragen gaan nu via een formulier, de uitnodigingslink wordt automatisch gecontroleerd.'],
  ['Tickets', 'Bij het sluiten van een ticket krijg je het hele gesprek als transcript in je DM.'],
  ['Tickets', 'Het ticketpaneel wordt na een herstart automatisch teruggezet als het weg is.'],
  ['Updates', 'Elke update van de bot verschijnt nu automatisch in dit kanaal.'],
  ['Commands', 'Nieuw command /changelog om zelf een update in dit kanaal te plaatsen.'],
  ['Updates', 'Bovenin elke update staat nu de datum van die dag.'],
  ['Tickets', 'Vragen- en Bestuur-tickets komen nu elk in hun eigen categorie.'],
  ['Partners', 'Geaccepteerde partners worden nu automatisch in het partnerkanaal geplaatst.'],
];

const textOf = ([category, text]) => `(${category}): ${text}`;

// Eén update-embed: "(Categorie): tekst" met de maker eronder
// Datum van vandaag bovenin, bv. "📅 20 november 2026" (Nederlandse tijd)
const today = () => `📅 ${new Date().toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long', year: 'numeric' })}`;

function updateEmbed(text, user) {
  const embed = new EmbedBuilder().setColor(COLOR).setTitle(today()).setDescription(text);
  if (user) embed.setFooter({ text: user.globalName ?? user.username, iconURL: user.displayAvatarURL({ size: 64 }) });
  return embed;
}

// ---------- /changelog: zelf een update schrijven ----------
const command = new SlashCommandBuilder()
  .setName('changelog')
  .setDescription('Zelf een update plaatsen in het updatekanaal')
  .setDMPermission(false)
  .toJSON();

async function openForm(interaction) {
  if (!cfg.adminIds.includes(interaction.user.id)) {
    return interaction.reply({ content: '❌ Alleen de beheerders van de bot kunnen dit.', flags: MessageFlags.Ephemeral });
  }
  await interaction.showModal(new ModalBuilder()
    .setCustomId('changelog_form')
    .setTitle('📋 Update plaatsen')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('categorie').setLabel('Categorie').setStyle(TextInputStyle.Short)
        .setPlaceholder('Bijv. Tickets, Bot, Commands, Server').setMaxLength(40).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('wijziging').setLabel('Wat is er aangepast?').setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Bijv. Het ticketpaneel heeft een nieuwe banner.').setMaxLength(1000).setRequired(true)),
    ));
}

async function submitForm(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const category = interaction.fields.getTextInputValue('categorie').trim().replace(/^\(|\)$/g, '');
  let text = interaction.fields.getTextInputValue('wijziging').trim();
  if (!/[.!?]$/.test(text)) text += '.';
  const channel = await interaction.client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return interaction.editReply('❌ Ik kan het updatekanaal niet vinden.');
  try {
    const msg = await channel.send({ embeds: [updateEmbed(`(${category}): ${text}`, interaction.user)] });
    await interaction.editReply(`✅ Update geplaatst: ${msg.url}`);
    console.log(`[updates] ${interaction.user.tag} plaatste: (${category}): ${text}`);
  } catch (e) {
    await interaction.editReply(`❌ Kon de update niet plaatsen: ${e.message}`);
  }
}

async function postNew(client) {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    // Wat staat er al? (beschrijvingen van berichten van de bot)
    const recent = await channel.messages.fetch({ limit: 100 });
    const posted = new Set(recent
      .filter((m) => m.author.id === client.user.id)
      .map((m) => m.embeds[0]?.description)
      .filter(Boolean));
    const todo = updates.filter((u) => !posted.has(textOf(u)));
    if (!todo.length) return console.log('[updates] Geen nieuwe updates');

    const author = await client.users.fetch(AUTHOR_ID).catch(() => null);
    for (const u of todo) {
      await channel.send({ embeds: [updateEmbed(textOf(u), author)] });
      console.log(`[updates] Geplaatst: ${textOf(u)}`);
    }
  } catch (e) {
    console.warn('[updates] Kon updates niet plaatsen:', e.message);
  }
}

module.exports = (client) => {
  client.once(Events.ClientReady, () => postNew(client));
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === 'changelog') await openForm(interaction);
      else if (interaction.isModalSubmit() && interaction.customId === 'changelog_form') await submitForm(interaction);
    } catch (e) {
      console.error('[updates]', e);
    }
  });
};
module.exports.command = command;
