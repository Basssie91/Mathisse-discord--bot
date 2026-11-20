// ============================================================
//  CHANGELOG
//  Elke wijziging aan de bot komt hieronder als regel bij (met een vaste, unieke id).
//  Met /changelog zie je eerst een voorbeeld van alles wat nog niet geplaatst is,
//  je kunt zelf regels toevoegen, en daarna kies je of je hem publiceert.
//  De bot onthoudt welke regels al geplaatst zijn.
// ============================================================
const path = require('node:path');
const {
  Events, EmbedBuilder, AttachmentBuilder, SlashCommandBuilder, ModalBuilder, ActionRowBuilder,
  TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const cfg = require('./config');
const store = require('./store');

const CHANNEL_ID = '1554884573274574908';
const BANNER_FILE = 'banner.png';
const BANNER_PATH = path.join(__dirname, '..', 'assets', BANNER_FILE);

// Regels van de bot zelf (nieuwe onderaan toevoegen, id nooit hergebruiken)
const items = [
  { id: 'bot-online', section: '⚙️ Bot', text: 'De bot draait nu **24/7** op Bot-Hosting' },
  { id: 'cmd-restart', section: '⌨️ Commando\'s', text: 'Nieuw: **/restart** om de bot vanuit Discord te herstarten' },
  { id: 'bot-verlengen', section: '⚙️ Bot', text: 'De eigenaar krijgt een **DM** wanneer de server bij Bot-Hosting verlengd moet worden' },
  { id: 'cmd-verlengen', section: '⌨️ Commando\'s', text: 'Nieuw: **/verlengen** met de status van de verlenging' },
  { id: 'tickets-paneel', section: '🎫 Tickets', text: 'Nieuw **ticketpaneel** met uitklapmenu: ❓ Vragen en 👑 Bestuur openen een privé ticket' },
  { id: 'tickets-categorie', section: '🎫 Tickets', text: 'Vragen- en Bestuur-tickets komen elk in hun **eigen categorie**' },
  { id: 'tickets-transcript', section: '🎫 Tickets', text: 'Bij het sluiten krijg je het hele gesprek als **transcript** in je DM' },
  { id: 'tickets-terug', section: '🎫 Tickets', text: 'Het ticketpaneel komt **automatisch terug** als het weg is' },
  { id: 'sollicitatie-formulier', section: '🛡️ Staff', text: '**Staff sollicitaties** gaan via een formulier in het ticketmenu' },
  { id: 'sollicitatie-kanaal', section: '🛡️ Staff', text: 'Sollicitaties komen in een **eigen kanaal** en worden door de beheerders afgehandeld' },
  { id: 'sollicitatie-rol', section: '🛡️ Staff', text: 'Bij accepteren kies je zelf **welke rol** iemand krijgt' },
  { id: 'partners-formulier', section: '🤝 Partners', text: '**Partneraanvragen** gaan via een formulier, de uitnodigingslink wordt gecontroleerd' },
  { id: 'partners-kanaal', section: '🤝 Partners', text: 'Aanvragen komen in een **eigen kanaal** en worden door de beheerders afgehandeld' },
  { id: 'partners-plaatsen', section: '🤝 Partners', text: 'Geaccepteerde partners worden **automatisch geplaatst** in het partnerkanaal' },
  { id: 'welkom-bericht', section: '👋 Welkom', text: 'Nieuwe leden krijgen een **welkomstbericht**' },
  { id: 'welkom-rol', section: '👋 Welkom', text: 'Nieuwe leden krijgen bij het joinen **automatisch een rol**' },
  { id: 'regels', section: '📜 Regels', text: 'De **serverregels** staan in het regelskanaal en komen automatisch terug als ze verwijderd worden' },
  { id: 'cmd-changelog', section: '⌨️ Commando\'s', text: 'Nieuw: **/changelog** om updates zoals deze te plaatsen' },
];

const DEFAULT_TITLE = '🚀 Update';
const loadState = () => store.load('changelog-state.json', { published: [], custom: [] });
const saveState = (s) => store.save('changelog-state.json', s);
const openItems = () => {
  const st = loadState();
  const done = new Set(st.published.flatMap((b) => b.ids));
  return [...items, ...(st.custom ?? [])].filter((i) => !done.has(i.id));
};
const nextVersion = () => `v1.${loadState().published.length + 1}`;
const isAdmin = (user) => cfg.adminIds.includes(user.id);

// Volgorde van de kopjes: eerst serverdingen, commando's en bot als laatste
const RANK = ['🎫 Tickets', '👋 Welkom', '📜 Regels', '🤝 Partners', '🛡️ Staff', '⌨️ Commando\'s', '⚙️ Bot'];
const rank = (name) => { const i = RANK.indexOf(name); return i === -1 ? RANK.length - 2 : i; };

function buildEmbed(guild, list, title) {
  const sections = [];
  for (const i of list) {
    let sec = sections.find((x) => x.name === i.section);
    if (!sec) { sec = { name: i.section, items: [] }; sections.push(sec); }
    sec.items.push(i.text);
  }
  sections.sort((a, b) => rank(a.name) - rank(b.name));
  return new EmbedBuilder()
    .setColor('#FFFFFF')
    .setAuthor({ name: `📋  CHANGELOG • ${guild.name}`, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
    .setTitle(`${nextVersion()} • ${title}`)
    .setDescription(`Update van <t:${Math.floor(Date.now() / 1000)}:D>`)
    .addFields(sections.slice(0, 25).map((sec) => ({
      name: sec.name,
      value: sec.items.map((t) => `• ${t}`).join('\n').slice(0, 1024),
    })))
    .setImage(`attachment://${BANNER_FILE}`)
    .setFooter({ text: 'Ideeën? Maak een ticket aan!' })
    .setTimestamp();
}
const banner = () => new AttachmentBuilder(BANNER_PATH, { name: BANNER_FILE });

const controls = () => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('cl_publish').setLabel('Publiceren').setEmoji('✅').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('cl_add').setLabel('Regel toevoegen').setEmoji('➕').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId('cl_cancel').setLabel('Annuleren').setEmoji('❌').setStyle(ButtonStyle.Secondary),
)];

function preview(guild) {
  const list = openItems();
  if (!list.length) {
    return { content: '📭 Er zijn geen nieuwe updates. Klik op **➕ Regel toevoegen** om zelf iets te schrijven.', embeds: [], files: [], attachments: [], components: controls() };
  }
  return {
    content: `👀 **Voorbeeld**: zo komt de changelog eruit te zien (${list.length} regel${list.length === 1 ? '' : 's'}). Alleen jij ziet dit.`,
    embeds: [buildEmbed(guild, list, DEFAULT_TITLE)],
    files: [banner()],
    attachments: [],
    components: controls(),
  };
}

const command = new SlashCommandBuilder()
  .setName('changelog')
  .setDescription('Changelog bekijken, regels toevoegen en publiceren')
  .setDMPermission(false)
  .toJSON();

const field = (id, label, style, max, required, placeholder, value) => {
  const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style)
    .setMaxLength(max).setRequired(required).setPlaceholder(placeholder);
  if (value) input.setValue(value);
  return new ActionRowBuilder().addComponents(input);
};

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    const id = interaction.isChatInputCommand() ? interaction.commandName : interaction.customId;
    if (!['changelog', 'cl_publish', 'cl_add', 'cl_cancel', 'cl_add_form', 'cl_publish_form'].includes(id)) return;
    try {
      if (!isAdmin(interaction.user)) {
        return interaction.reply({ content: '❌ Alleen de beheerders van de bot kunnen dit.', flags: MessageFlags.Ephemeral });
      }

      // /changelog: voorbeeld met knoppen
      if (id === 'changelog') return interaction.reply({ ...preview(interaction.guild), flags: MessageFlags.Ephemeral });

      if (id === 'cl_cancel') {
        return interaction.update({ content: '❌ Geannuleerd. Er is niets geplaatst.', embeds: [], components: [], attachments: [] });
      }

      // Zelf een regel toevoegen
      if (id === 'cl_add') {
        return interaction.showModal(new ModalBuilder().setCustomId('cl_add_form').setTitle('➕ Regel toevoegen').addComponents(
          field('kopje', 'Kopje', TextInputStyle.Short, 40, true, 'Bijv. 🎫 Tickets, 🎮 Server, ⚙️ Bot'),
          field('tekst', 'Wat is er aangepast?', TextInputStyle.Paragraph, 300, true, 'Bijv. Het ticketpaneel heeft een nieuwe banner'),
        ));
      }
      if (id === 'cl_add_form') {
        const st = loadState();
        st.custom = st.custom ?? [];
        st.custom.push({
          id: `eigen-${Date.now().toString(36)}`,
          section: interaction.fields.getTextInputValue('kopje').trim(),
          text: interaction.fields.getTextInputValue('tekst').trim().replace(/[.]$/, ''),
        });
        saveState(st);
        return interaction.update(preview(interaction.guild));
      }

      // Publiceren: eerst een titel vragen
      if (id === 'cl_publish') {
        if (!openItems().length) return interaction.reply({ content: '📭 Er is niets om te publiceren.', flags: MessageFlags.Ephemeral });
        return interaction.showModal(new ModalBuilder().setCustomId('cl_publish_form').setTitle(`✅ ${nextVersion()} publiceren`).addComponents(
          field('titel', 'Titel van de update', TextInputStyle.Short, 80, true, 'Bijv. 🎫 Update: tickets en partners', DEFAULT_TITLE),
        ));
      }
      if (id === 'cl_publish_form') {
        const list = openItems();
        if (!list.length) return interaction.update({ content: '📭 Deze update is al geplaatst.', embeds: [], components: [], attachments: [] });
        const channel = await interaction.client.channels.fetch(CHANNEL_ID).catch(() => null);
        if (!channel) return interaction.reply({ content: '❌ Ik kan het changelogkanaal niet vinden.', flags: MessageFlags.Ephemeral });
        const version = nextVersion();
        const title = interaction.fields.getTextInputValue('titel').trim();
        const msg = await channel.send({ embeds: [buildEmbed(interaction.guild, list, title)], files: [banner()] });
        const st = loadState();
        st.published.push({ version, title, at: Date.now(), by: interaction.user.id, ids: list.map((i) => i.id) });
        saveState(st);
        console.log(`[changelog] ${version} gepubliceerd door ${interaction.user.tag}`);
        return interaction.update({ content: `✅ Changelog **${version}** is gepubliceerd: ${msg.url}`, embeds: [], components: [], attachments: [] });
      }
    } catch (e) {
      console.error('[changelog]', e);
      const m = { content: '❌ Er ging iets mis met de changelog.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) interaction.followUp(m).catch(() => {});
      else interaction.reply(m).catch(() => {});
    }
  });
};
module.exports.command = command;
