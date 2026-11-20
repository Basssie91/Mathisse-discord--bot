// Suggestiepaneel: leden dienen via een knop een suggestie in, iedereen stemt met 👍/👎,
// het team keurt goed of af. Elke suggestie krijgt een eigen draadje om over te praten.
// Het paneel staat altijd onderaan, wordt bij elke start gecontroleerd en komt terug als het verwijderd wordt.
const path = require('node:path');
const {
  Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder,
} = require('discord.js');
const cfg = require('./config');
const { load, save } = require('./store');

const FILE = 'suggestions.json';
const PANEL_TITLE = '💡  SUGGESTIES';
const BANNER_FILE = 'banner.png';
const BANNER_PATH = path.join(__dirname, '..', 'assets', BANNER_FILE);

const data = () => load(FILE, { count: 0, items: {}, panelId: null });
// Team: staffrol, bestuurrol, beheerders en superUsers
const isStaff = (m) => cfg.adminIds.includes(m.id) || (cfg.superUserIds ?? []).includes(m.id)
  || m.roles.cache.some((r) => [cfg.staffRoleId, cfg.bestuurRoleId].includes(r.id));

// ---------- Paneel (staat altijd onderaan) ----------
function panel(guild) {
  return {
    embeds: [new EmbedBuilder()
      .setColor(cfg.color)
      .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
      .setTitle(PANEL_TITLE)
      .setDescription('Heb je een idee om de server beter te maken?\nKlik op de knop hieronder en dien je suggestie in!')
      .setImage(`attachment://${BANNER_FILE}`)
      .setFooter({ text: `${guild.name} • Suggesties` })],
    files: [new AttachmentBuilder(BANNER_PATH, { name: BANNER_FILE })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sug_new').setLabel('Suggestie indienen').setEmoji('💡').setStyle(ButtonStyle.Primary),
    )],
  };
}

// Oude panelen weghalen en een nieuw paneel onderaan zetten
async function refreshPanel(channel) {
  const d = data();
  const recent = await channel.messages.fetch({ limit: 30 });
  const old = recent.filter((m) => m.author.id === channel.client.user.id && m.embeds[0]?.title === PANEL_TITLE);
  d.panelId = null; // zodat het verwijderen hieronder niet als "paneel verwijderd" telt
  save(FILE, d);
  for (const m of old.values()) await m.delete().catch(() => {});
  const msg = await channel.send(panel(channel.guild));
  const d2 = data();
  d2.panelId = msg.id;
  save(FILE, d2);
}

// Bij de start: staat het paneel er nog (en is het het laatste bericht)? Anders opnieuw onderaan zetten
async function checkPanel(client) {
  try {
    const channel = await client.channels.fetch(cfg.suggestionChannelId);
    const last = (await channel.messages.fetch({ limit: 1 })).first();
    const isPanel = last && last.author.id === client.user.id && last.embeds[0]?.title === PANEL_TITLE;
    if (isPanel) {
      await last.edit({ ...panel(channel.guild), attachments: [] });
      const d = data(); d.panelId = last.id; save(FILE, d);
      console.log('[suggestie] Paneel bijgewerkt');
    } else {
      await refreshPanel(channel);
      console.log('[suggestie] Paneel (opnieuw) onderaan geplaatst');
    }
  } catch (e) {
    console.warn('[suggestie] Kon paneel niet controleren:', e.message);
  }
}

// ---------- Suggestie-embed ----------
const STATUS = {
  open: { color: '#FFFFFF', text: '🕒 Open voor stemmen' },
  approved: { color: '#57F287', text: '✅ Goedgekeurd' },
  denied: { color: '#ED4245', text: '❌ Afgewezen' },
};

function render(s, author) {
  const total = s.up.length + s.down.length;
  const pct = total ? Math.round((s.up.length / total) * 100) : 0;
  const bar = total ? '🟩'.repeat(Math.round(pct / 10)) + '🟥'.repeat(10 - Math.round(pct / 10)) : '⬜'.repeat(10);
  const st = STATUS[s.status];

  const embed = new EmbedBuilder()
    .setColor(st.color)
    .setAuthor({ name: author?.tag ?? 'Onbekend', iconURL: author?.displayAvatarURL({ size: 64 }) })
    .setTitle(`💡 Suggestie #${s.n}`)
    .setDescription(s.text)
    .addFields(
      { name: 'Stemmen', value: `${bar}\n👍 **${s.up.length}**  •  👎 **${s.down.length}**  •  ${pct}% voor` },
      { name: 'Status', value: st.text + (s.handledBy ? ` door <@${s.handledBy}>` : '') },
    )
    .setTimestamp(s.createdAt);

  const open = s.status === 'open';
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sug_up').setEmoji('👍').setLabel(String(s.up.length)).setStyle(ButtonStyle.Success).setDisabled(!open),
    new ButtonBuilder().setCustomId('sug_down').setEmoji('👎').setLabel(String(s.down.length)).setStyle(ButtonStyle.Danger).setDisabled(!open),
  )];
  if (open) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sug_approve').setLabel('Goedkeuren').setEmoji('✅').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sug_deny').setLabel('Afwijzen').setEmoji('❌').setStyle(ButtonStyle.Secondary),
    ));
  }
  return { embeds: [embed], components: rows };
}

// ---------- Acties ----------
async function openModal(interaction) {
  await interaction.showModal(new ModalBuilder()
    .setCustomId('sug_modal')
    .setTitle('💡 Nieuwe suggestie')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('tekst').setLabel('Wat is je suggestie?')
        .setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1500).setRequired(true)
        .setPlaceholder('Beschrijf je idee zo duidelijk mogelijk...'),
    )));
}

async function submit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = await interaction.client.channels.fetch(cfg.suggestionChannelId);
  const d = data();
  d.count += 1;
  const s = {
    n: d.count, authorId: interaction.user.id, text: interaction.fields.getTextInputValue('tekst'),
    up: [], down: [], status: 'open', createdAt: Date.now(),
  };
  save(FILE, d);
  const msg = await channel.send(render(s, interaction.user));
  const d2 = data();
  d2.items[msg.id] = s;
  save(FILE, d2);

  await msg.startThread({ name: `💬 Suggestie #${s.n}`, autoArchiveDuration: 10080 }).catch(() => {});
  await refreshPanel(channel);
  await interaction.editReply(`✅ Je suggestie staat erin: ${msg.url}`);
  console.log(`[suggestie] #${s.n} van ${interaction.user.tag}`);
}

async function vote(interaction, up) {
  const d = data();
  const s = d.items[interaction.message.id];
  if (!s) return interaction.reply({ content: 'Deze suggestie is niet gevonden.', flags: MessageFlags.Ephemeral });
  if (s.status !== 'open') return interaction.reply({ content: 'Op deze suggestie kan niet meer gestemd worden.', flags: MessageFlags.Ephemeral });

  const id = interaction.user.id;
  const [mine, other] = up ? [s.up, s.down] : [s.down, s.up];
  const oi = other.indexOf(id); if (oi !== -1) other.splice(oi, 1);
  const mi = mine.indexOf(id);
  if (mi !== -1) mine.splice(mi, 1); else mine.push(id); // nog een keer klikken = stem weghalen
  save(FILE, d);

  const author = await interaction.client.users.fetch(s.authorId).catch(() => null);
  await interaction.update(render(s, author));
}

async function handle(interaction, approved) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Alleen het team kan suggesties goedkeuren of afwijzen.', flags: MessageFlags.Ephemeral });
  }
  const d = data();
  const s = d.items[interaction.message.id];
  if (!s) return interaction.reply({ content: 'Deze suggestie is niet gevonden.', flags: MessageFlags.Ephemeral });
  s.status = approved ? 'approved' : 'denied';
  s.handledBy = interaction.user.id;
  save(FILE, d);

  const author = await interaction.client.users.fetch(s.authorId).catch(() => null);
  await interaction.update(render(s, author));
  if (interaction.message.thread) {
    await interaction.message.thread.send(`${approved ? '✅ Goedgekeurd' : '❌ Afgewezen'} door ${interaction.user}.`).catch(() => {});
    await interaction.message.thread.setLocked(true).catch(() => {});
  }
  console.log(`[suggestie] #${s.n} ${approved ? 'goedgekeurd' : 'afgewezen'} door ${interaction.user.tag}`);
}

// ---------- Koppelen ----------
module.exports = (client) => {
  client.once(Events.ClientReady, async () => {
    try {
      const channel = await client.channels.fetch(cfg.suggestionChannelId);
      // Leden kunnen niet los typen, wel in de draadjes praten
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        SendMessages: false, CreatePublicThreads: false, SendMessagesInThreads: true,
      });
      await channel.permissionOverwrites.edit(client.user.id, {
        SendMessages: true, CreatePublicThreads: true, ManageThreads: true, EmbedLinks: true, AttachFiles: true,
      });
    } catch (e) {
      console.warn('[suggestie] Kon rechten van het suggestiekanaal niet instellen:', e.message);
    }
    await checkPanel(client);
  });

  // Paneel verwijderd? Meteen terugzetten
  client.on(Events.MessageDelete, (message) => {
    if (message.id && message.id === data().panelId) {
      console.log('[suggestie] Paneel verwijderd, ik plaats het opnieuw');
      setTimeout(() => checkPanel(client), 2000);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    const id = interaction.customId;
    if (!id?.startsWith('sug_')) return;
    try {
      if (interaction.isButton()) {
        if (id === 'sug_new') await openModal(interaction);
        else if (id === 'sug_up') await vote(interaction, true);
        else if (id === 'sug_down') await vote(interaction, false);
        else if (id === 'sug_approve') await handle(interaction, true);
        else if (id === 'sug_deny') await handle(interaction, false);
      } else if (interaction.isModalSubmit() && id === 'sug_modal') {
        await submit(interaction);
      }
    } catch (e) {
      console.error('[suggestie]', e);
      const msg = { content: 'Er ging iets mis. Probeer het opnieuw.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) interaction.followUp(msg).catch(() => {});
      else interaction.reply(msg).catch(() => {});
    }
  });
};
