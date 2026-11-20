// /giveaway: giveaway starten in het giveawaykanaal
// Meedoen met een knop (nog een keer klikken = uitschrijven). Na afloop worden de winnaars willekeurig gekozen.
// Giveaways worden opgeslagen, dus een herstart van de bot stopt ze niet.
const {
  Events, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const cfg = require('./config');
const { load, save, newId, ts } = require('./store');

const FILE = 'giveaways.json';
const UNITS = { m: 60e3, min: 60e3, u: 3600e3, h: 3600e3, d: 86400e3, w: 604800e3 };

// "30m", "2u", "1d", "1w" → milliseconden
function parseDuration(text) {
  const m = String(text).trim().toLowerCase().replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*(m|min|u|h|d|w)$/);
  return m ? Math.round(Number(m[1]) * UNITS[m[2]]) : null;
}

const command = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Een giveaway starten')
  .addStringOption((o) => o.setName('prijs').setDescription('Wat valt er te winnen?').setMaxLength(200).setRequired(true))
  .addStringOption((o) => o.setName('duur').setDescription('Hoe lang? Bijv. 30m, 2u, 1d of 1w').setRequired(true))
  .addIntegerOption((o) => o.setName('winnaars').setDescription('Aantal winnaars (standaard 1)').setMinValue(1).setMaxValue(20))
  .addStringOption((o) => o.setName('info').setDescription('Extra uitleg (optioneel)').setMaxLength(500))
  .setDMPermission(false)
  .toJSON();

const allowed = (member) => cfg.adminIds.includes(member.id)
  || member.roles.cache.some((r) => cfg.giveawayRoleIds.includes(r.id));

function embedFor(g, guild) {
  const ended = g.status === 'ended';
  const lines = [
    g.info ? `${g.info}\n` : null,
    ended ? `🏁 **Afgelopen** ${ts(g.endsAt)}` : `⏰ Eindigt ${ts(g.endsAt)} (${ts(g.endsAt, 'f')})`,
    `🏆 **${g.winners}** winnaar${g.winners === 1 ? '' : 's'}`,
    `👥 **${g.entries.length}** deelnemer${g.entries.length === 1 ? '' : 's'}`,
    `🎙️ Georganiseerd door <@${g.hostId}>`,
  ];
  if (ended) {
    lines.push('', g.winnerIds.length ? `🎉 **Winnaar${g.winnerIds.length === 1 ? '' : 's'}:** ${g.winnerIds.map((id) => `<@${id}>`).join(', ')}` : '😕 Niemand deed mee, dus er is geen winnaar.');
  } else {
    lines.push('', 'Klik op **🎉 Meedoen** om mee te doen!');
  }
  return new EmbedBuilder()
    .setColor(ended ? '#2B2D31' : cfg.color)
    .setAuthor({ name: `🎁  GIVEAWAY • ${guild.name}`, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
    .setTitle(g.prize)
    .setDescription(lines.filter((l) => l !== null).join('\n'))
    .setFooter({ text: ended ? 'Giveaway afgelopen' : 'Nog een keer klikken = uitschrijven' })
    .setTimestamp(g.endsAt);
}

function buttons(g) {
  if (g.status === 'ended') {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gw_reroll:${g.id}`).setLabel('Nieuwe winnaar').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
    )];
  }
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gw_join:${g.id}`).setLabel('Meedoen').setEmoji('🎉').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`gw_end:${g.id}`).setLabel('Nu beëindigen').setEmoji('⏹️').setStyle(ButtonStyle.Secondary),
  )];
}

const pick = (list, n, exclude = []) => {
  const pool = list.filter((id) => !exclude.includes(id));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
};

async function fetchMessage(client, g) {
  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  const msg = channel ? await channel.messages.fetch(g.messageId).catch(() => null) : null;
  return { channel, msg };
}

const timers = new Map();
function schedule(client, g) {
  clearTimeout(timers.get(g.id));
  // setTimeout kan max. ~24 dagen; daarna opnieuw plannen
  const wait = Math.min(Math.max(0, g.endsAt - Date.now()), 2 ** 31 - 1);
  timers.set(g.id, setTimeout(() => (Date.now() >= g.endsAt ? endGiveaway(client, g.id) : schedule(client, load(FILE, {})[g.id] ?? g)), wait));
}

async function endGiveaway(client, id) {
  const d = load(FILE, {});
  const g = d[id];
  if (!g || g.status === 'ended') return;
  g.status = 'ended';
  g.endsAt = Math.min(g.endsAt, Date.now());
  g.winnerIds = pick(g.entries, g.winners);
  save(FILE, d);
  clearTimeout(timers.get(id));

  const { channel, msg } = await fetchMessage(client, g);
  if (!channel) return console.warn('[giveaway] Kanaal niet gevonden');
  if (msg) await msg.edit({ embeds: [embedFor(g, channel.guild)], components: buttons(g) }).catch(() => {});
  await channel.send({
    content: g.winnerIds.length
      ? `🎉 Gefeliciteerd ${g.winnerIds.map((u) => `<@${u}>`).join(', ')}! Je hebt **${g.prize}** gewonnen! Neem contact op met <@${g.hostId}>.`
      : `😕 Niemand deed mee aan **${g.prize}**, dus er is geen winnaar.`,
    reply: msg ? { messageReference: msg.id } : undefined,
    allowedMentions: { users: [...g.winnerIds, g.hostId] },
  }).catch(() => {});
  console.log(`[giveaway] ${g.prize} afgelopen, winnaars: ${g.winnerIds.join(', ') || 'geen'}`);
}

async function start(interaction) {
  if (!allowed(interaction.member)) {
    return interaction.reply({ content: '❌ Je hebt geen toestemming om een giveaway te starten.', flags: MessageFlags.Ephemeral });
  }
  const ms = parseDuration(interaction.options.getString('duur'));
  if (!ms || ms < 60e3) {
    return interaction.reply({ content: '❌ Ongeldige duur. Gebruik bijvoorbeeld **30m**, **2u**, **1d** of **1w** (minimaal 1 minuut).', flags: MessageFlags.Ephemeral });
  }
  if (ms > 60 * 86400e3) return interaction.reply({ content: '❌ Een giveaway mag maximaal 60 dagen duren.', flags: MessageFlags.Ephemeral });

  const channel = await interaction.client.channels.fetch(cfg.giveawayChannelId).catch(() => null);
  if (!channel) return interaction.reply({ content: '❌ Ik kan het giveawaykanaal niet vinden.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const g = {
    id: newId(),
    prize: interaction.options.getString('prijs'),
    info: interaction.options.getString('info'),
    winners: interaction.options.getInteger('winnaars') ?? 1,
    hostId: interaction.user.id,
    channelId: channel.id,
    endsAt: Date.now() + ms,
    entries: [],
    winnerIds: [],
    status: 'running',
  };
  const msg = await channel.send({ embeds: [embedFor(g, channel.guild)], components: buttons(g) });
  g.messageId = msg.id;
  const d = load(FILE, {});
  d[g.id] = g;
  save(FILE, d);
  schedule(interaction.client, g);
  await interaction.editReply(`✅ Giveaway gestart: ${msg.url}`);
  console.log(`[giveaway] ${interaction.user.tag} startte: ${g.prize}`);
}

async function onButton(interaction) {
  const [action, id] = interaction.customId.split(':');
  const d = load(FILE, {});
  const g = d[id];
  if (!g) return interaction.reply({ content: '❌ Deze giveaway bestaat niet meer.', flags: MessageFlags.Ephemeral });

  if (action === 'gw_join') {
    if (g.status === 'ended' || Date.now() >= g.endsAt) return interaction.reply({ content: '⏰ Deze giveaway is al afgelopen.', flags: MessageFlags.Ephemeral });
    const i = g.entries.indexOf(interaction.user.id);
    if (i === -1) g.entries.push(interaction.user.id); else g.entries.splice(i, 1);
    save(FILE, d);
    await interaction.update({ embeds: [embedFor(g, interaction.guild)] });
    return interaction.followUp({ content: i === -1 ? '🎉 Je doet mee! Succes!' : '👋 Je doet niet meer mee.', flags: MessageFlags.Ephemeral });
  }

  if (!allowed(interaction.member)) {
    return interaction.reply({ content: '❌ Alleen het team kan dit.', flags: MessageFlags.Ephemeral });
  }
  if (action === 'gw_end') {
    await interaction.reply({ content: '⏹️ Giveaway wordt beëindigd...', flags: MessageFlags.Ephemeral });
    return endGiveaway(interaction.client, id);
  }
  if (action === 'gw_reroll') {
    const [winner] = pick(g.entries, 1, g.winnerIds);
    if (!winner) return interaction.reply({ content: '😕 Er zijn geen andere deelnemers meer om uit te kiezen.', flags: MessageFlags.Ephemeral });
    g.winnerIds.push(winner);
    save(FILE, d);
    await interaction.update({ embeds: [embedFor(g, interaction.guild)] });
    return interaction.channel.send({
      content: `🔁 Nieuwe winnaar voor **${g.prize}**: <@${winner}>! Gefeliciteerd! 🎉`,
      allowedMentions: { users: [winner] },
    });
  }
}

module.exports = (client) => {
  // Lopende giveaways weer inplannen na een herstart
  client.once(Events.ClientReady, () => {
    const running = Object.values(load(FILE, {})).filter((g) => g.status === 'running');
    for (const g of running) schedule(client, g);
    if (running.length) console.log(`[giveaway] ${running.length} lopende giveaway(s) ingepland`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === 'giveaway') await start(interaction);
      else if (interaction.isButton() && interaction.customId.startsWith('gw_')) await onButton(interaction);
    } catch (e) {
      console.error('[giveaway]', e);
      const m = { content: '❌ Er ging iets mis met de giveaway.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) interaction.followUp(m).catch(() => {});
      else interaction.reply(m).catch(() => {});
    }
  });
};
module.exports.command = command;
