// ============================================================
//  CHANGELOG
//  Elke wijziging aan de bot komt hieronder als regel bij (met een vaste, unieke id).
//  Met /changelog zie je eerst een voorbeeld van alles wat nog niet geplaatst is,
//  je kunt zelf regels toevoegen, en daarna kies je of je hem publiceert.
//  Na publiceren blijft de versie open (opnieuw publiceren vervangt het bericht)
//  tot je op "afronden" klikt; pas dan begint de volgende versie.
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
  { id: 'tickets-logs', section: '🎫 Tickets', text: 'Gesloten tickets komen met het **transcript** in het logkanaal, met een **📥 Download**-knop (ook in je DM)' },
  { id: 'tickets-thumbnail', section: '🎫 Tickets', text: 'Nieuw in het ticketmenu: **🖼️ Thumbnail**! Vraag een thumbnail aan via een formulier' },
  { id: 'tickets-formulier', section: '🎫 Tickets', text: '**Vragen**- en **Bestuur**-tickets openen nu met een formulier, zodat het team meteen weet waar het over gaat' },
  { id: 'sollicitatie-formulier', section: '🛡️ Staff', text: '**Staff sollicitaties** gaan via een formulier in het ticketmenu' },
  { id: 'sollicitatie-kanaal', section: '🛡️ Staff', text: 'Sollicitaties komen in een **eigen kanaal** en worden door de beheerders afgehandeld' },
  { id: 'sollicitatie-rol', section: '🛡️ Staff', text: 'Bij accepteren kies je zelf **welke rol** iemand krijgt' },
  { id: 'partners-formulier', section: '🤝 Partners', text: '**Partneraanvragen** gaan via een formulier, de uitnodigingslink wordt gecontroleerd' },
  { id: 'partners-kanaal', section: '🤝 Partners', text: 'Aanvragen komen in een **eigen kanaal** en worden door de beheerders afgehandeld' },
  { id: 'partners-plaatsen', section: '🤝 Partners', text: 'Geaccepteerde partners worden **automatisch geplaatst** in het partnerkanaal' },
  { id: 'partners-rol', section: '🤝 Partners', text: 'Geaccepteerde partners krijgen nu **automatisch de partnerrol**' },
  { id: 'welkom-bericht', section: '👋 Welkom', text: 'Nieuwe leden krijgen een **welkomstbericht**' },
  { id: 'welkom-rol', section: '👋 Welkom', text: 'Nieuwe leden krijgen bij het joinen **automatisch een rol**' },
  { id: 'regels', section: '📜 Regels', text: 'De **serverregels** staan in het regelskanaal en komen automatisch terug als ze verwijderd worden' },
  { id: 'suggesties', section: '💡 Suggesties', text: 'Nieuw **suggestiepaneel**! Dien je idee in, stem met 👍/👎 en praat erover in het draadje' },
  { id: 'rollenpaneel', section: '🔔 Meldingen', text: 'Nieuw **rollenpaneel**: kies zelf of je meldingen wilt voor changelog, content en mededelingen' },
  { id: 'rollen-tag', section: '🔔 Meldingen', text: 'Bij een nieuwe changelog of contentmelding wordt de bijbehorende **meldingsrol getagd**' },
  { id: 'promo', section: '🤝 Partners', text: 'Onze **testserver** en **roleplay server** staan nu in het promotiekanaal, met live ledenaantallen' },
  { id: 'cmd-changelog', section: '⌨️ Commando\'s', text: 'Nieuw: **/changelog** om updates zoals deze te plaatsen' },
  { id: 'cmd-opruimen', section: '⌨️ Commando\'s', text: 'Nieuw: **/opruimen** om berichten te verwijderen, eventueel alleen van één persoon' },
  { id: 'giveaways', section: '🎁 Giveaways', text: 'Nieuw: **/giveaway**! Doe mee met één klik op **🎉 Meedoen**, de winnaars worden willekeurig gekozen' },
  { id: 'woordketting', section: '🎮 Spellen', text: 'Nieuw: **woordketting**! Elk woord begint met de laatste letter van het vorige woord' },
  { id: 'woordketting-inhalen', section: '🎮 Spellen', text: 'Woorden die je stuurt terwijl de bot offline is, worden **alsnog gecontroleerd** zodra hij weer online is' },
  { id: 'tellen', section: '🎮 Spellen', text: 'Nieuw: **tellen**! We gaan verder waar jullie gebleven waren, bij **135**' },
  { id: 'tellen-inhalen', section: '🎮 Spellen', text: 'Getallen die je stuurt terwijl de bot offline is, worden **alsnog gecontroleerd** zodra hij weer online is' },
  { id: 'botstatus', section: '⚙️ Bot', text: 'Nieuw **statuskanaal**: zie of de bot 🟢 online, 🔄 aan het herstarten of 🔴 offline is, met de geschiedenis van storingen' },
  { id: 'botstatus-geschiedenis', section: '⚙️ Bot', text: 'De geschiedenis in het statuskanaal begint na elke herstart opnieuw' },
  { id: 'onderhoud', section: '⚙️ Bot', text: 'Nieuw: **onderhoudsmodus**! Tijdens onderhoud staat de bot even op pauze en zie je 🟠 in het statuskanaal' },
  { id: 'ledenteller', section: '⚙️ Bot', text: 'De bot laat nu het **aantal leden** zien als status in de ledenlijst' },
  { id: 'content', section: '📡 Content', text: 'Nieuw: **contentmeldingen**! Een melding bij een nieuwe YouTube-video of als een streamer live gaat op Twitch of Kick' },
  { id: 'content-yt-live', section: '📡 Content', text: 'Ook een melding als iemand **live gaat op YouTube**' },
  { id: 'cmd-content', section: '⌨️ Commando\'s', text: 'Nieuw: **/content** opent een formulier om streamers en YouTubers toe te voegen, **/content-lijst** laat ze allemaal zien' },
  { id: 'cmd-staff-update', section: '🛡️ Staff', text: 'Nieuw: **/staff-update** om aannames, promoties, degradaties en ontslagen te plaatsen via een formulier' },
  { id: 'cmd-commands', section: '⌨️ Commando\'s', text: 'Nieuw: **/commands** laat zien welke commands en functies er zijn' },
  { id: 'verjaardag', section: '🎂 Verjaardagen', text: 'Nieuw: **/verjaardag**! Vul je verjaardag in en krijg een felicitatie op je grote dag' },
  { id: 'verjaardag-rol', section: '🎂 Verjaardagen', text: 'Ben je jarig? Dan krijg je die dag de rol **🎂 Jarig**' },
  { id: 'staff-overzicht', section: '🛡️ Staff', text: 'Nieuw **staff-overzicht** met alle commands en wie ze kan gebruiken, wordt automatisch bijgewerkt' },
  { id: 'staffrol-auto', section: '🛡️ Staff', text: 'Je krijgt nu **automatisch de staffrol** bij een staff-functie, en verliest hem als je geen functie meer hebt' },
];

const DEFAULT_TITLE = '🚀 Update';
// published: afgeronde versies (die regels komen nooit meer terug)
// current:   de versie die nu loopt; blijft staan na publiceren tot je zelf "Nieuwe versie beginnen" kiest
function loadState() {
  const st = store.load('changelog-state.json', { published: [], custom: [] });
  st.custom ??= [];
  // Eenmalig: de laatst geplaatste versie (v1.3) weer open zetten, zodat hij opnieuw geplaatst kan worden
  if (!st.migratedCurrent) {
    st.migratedCurrent = true;
    if (!st.current && st.published.length) {
      const last = st.published.pop();
      st.current = { version: last.version, title: last.title, ids: last.ids, messageId: null, channelId: null };
    }
    store.save('changelog-state.json', st);
  }
  return st;
}
const saveState = (s) => store.save('changelog-state.json', s);
const openItems = () => {
  const st = loadState();
  const done = new Set(st.published.flatMap((b) => b.ids));
  return [...items, ...st.custom].filter((i) => !done.has(i.id));
};
const nextVersion = () => loadState().current?.version ?? `v1.${loadState().published.length + 1}`;
const isAdmin = (user) => cfg.adminIds.includes(user.id);

// Volgorde van de kopjes: eerst serverdingen, commando's en bot als laatste
const RANK = ['🎂 Verjaardagen', '🔔 Meldingen', '💡 Suggesties', '🎁 Giveaways', '📡 Content', '🎮 Spellen', '🎫 Tickets', '👋 Welkom', '📜 Regels', '🤝 Partners', '🛡️ Staff', '⌨️ Commando\'s', '⚙️ Bot'];
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

function controls() {
  const cur = loadState().current;
  const live = Boolean(cur?.messageId);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cl_publish').setLabel(live ? 'Opnieuw publiceren' : 'Publiceren').setEmoji(live ? '🔁' : '✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cl_add').setLabel('Regel toevoegen').setEmoji('➕').setStyle(ButtonStyle.Primary),
  );
  if (cur) row.addComponents(new ButtonBuilder().setCustomId('cl_reset').setLabel(`${cur.version} afronden`).setEmoji('🆕').setStyle(ButtonStyle.Secondary));
  row.addComponents(new ButtonBuilder().setCustomId('cl_cancel').setLabel('Annuleren').setEmoji('❌').setStyle(ButtonStyle.Secondary));
  return [row];
}

function preview(guild) {
  const list = openItems();
  if (!list.length) {
    return { content: '📭 Er zijn geen nieuwe updates. Klik op **➕ Regel toevoegen** om zelf iets te schrijven.', embeds: [], files: [], attachments: [], components: controls() };
  }
  return {
    content: [
      `👀 **Voorbeeld van ${nextVersion()}** (${list.length} regel${list.length === 1 ? '' : 's'}). Alleen jij ziet dit.`,
      loadState().current?.messageId ? '-# Deze versie is al geplaatst. **🔁 Opnieuw publiceren** vervangt het oude bericht.' : null,
      '-# De lijst blijft staan tot je op **🆕 afronden** klikt; dan begint de volgende versie.',
    ].filter(Boolean).join('\n'),
    embeds: [buildEmbed(guild, list, loadState().current?.title ?? DEFAULT_TITLE)],
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
    if (!['changelog', 'cl_publish', 'cl_add', 'cl_cancel', 'cl_reset', 'cl_add_form', 'cl_publish_form'].includes(id)) return;
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
          field('titel', 'Titel van de update', TextInputStyle.Short, 80, true, 'Bijv. 🎫 Update: tickets en partners', loadState().current?.title ?? DEFAULT_TITLE),
        ));
      }
      if (id === 'cl_publish_form') {
        const list = openItems();
        if (!list.length) return interaction.update({ content: '📭 Deze update is al geplaatst.', embeds: [], components: [], attachments: [] });
        const channel = await interaction.client.channels.fetch(CHANNEL_ID).catch(() => null);
        if (!channel) return interaction.reply({ content: '❌ Ik kan het changelogkanaal niet vinden.', flags: MessageFlags.Ephemeral });
        const version = nextVersion();
        const title = interaction.fields.getTextInputValue('titel').trim();
        // Meldingsrol 📋 Changelog taggen (uit het rollenpaneel)
        const roleId = require('./selfRoles').roleId('changelog');
        const msg = await channel.send({
          content: roleId ? `<@&${roleId}>` : undefined,
          embeds: [buildEmbed(interaction.guild, list, title)],
          files: [banner()],
          allowedMentions: { roles: roleId ? [roleId] : [] },
        });
        const st = loadState();
        // Al eerder geplaatst? Dan het oude bericht weghalen (opnieuw publiceren vervangt het)
        if (st.current?.messageId) {
          const oldCh = await interaction.client.channels.fetch(st.current.channelId).catch(() => null);
          await oldCh?.messages.delete(st.current.messageId).catch(() => {});
        }
        st.current = { version, title, at: Date.now(), by: interaction.user.id, ids: list.map((i) => i.id), messageId: msg.id, channelId: channel.id };
        saveState(st);
        console.log(`[changelog] ${version} gepubliceerd door ${interaction.user.tag}`);
        return interaction.update({
          content: `✅ Changelog **${version}** is gepubliceerd: ${msg.url}\n-# Klaar met deze versie? Typ \`/changelog\` en klik op **🆕 ${version} afronden**. Tot die tijd kun je hem aanpassen en opnieuw publiceren.`,
          embeds: [], components: [], attachments: [],
        });
      }

      // Versie afronden: pas nu gaat de lijst leeg en begint de volgende versie
      if (id === 'cl_reset') {
        const st = loadState();
        if (!st.current) return interaction.update({ content: 'ℹ️ Er is geen versie om af te ronden.', embeds: [], components: [], attachments: [] });
        const done = st.current;
        st.published.push({ version: done.version, title: done.title, at: done.at ?? Date.now(), by: done.by ?? interaction.user.id, ids: done.ids });
        st.current = null;
        saveState(st);
        console.log(`[changelog] ${done.version} afgerond door ${interaction.user.tag}`);
        return interaction.update({ content: `🆕 **${done.version}** is afgerond. De volgende changelog wordt **${nextVersion()}**.`, embeds: [], components: [], attachments: [] });
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
