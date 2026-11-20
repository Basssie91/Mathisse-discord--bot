// /giveaway: opent een formulier (prijs, aantal winnaars, duur, uitleg) en start de giveaway in het giveawaykanaal
// Meedoen met een knop (nog een keer klikken = uitschrijven). Na afloop worden de winnaars willekeurig gekozen.
// Giveaways worden opgeslagen, dus een herstart van de bot stopt ze niet.
const {
  Events, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
} = require('discord.js');
const cfg = require('./config');
const anon = require('./anon');
const { load, save, newId, ts } = require('./store');

const FILE = 'giveaways.json';
const HOUR = 3600e3;
const DAY = 24 * HOUR;
// Keuzes voor de duur in het formulier
const DURATIONS = [
  ['1 uur', HOUR], ['6 uur', 6 * HOUR], ['12 uur', 12 * HOUR],
  ['1 dag', DAY], ['2 dagen', 2 * DAY], ['3 dagen', 3 * DAY], ['4 dagen', 4 * DAY], ['5 dagen', 5 * DAY], ['6 dagen', 6 * DAY],
  ['1 week', 7 * DAY], ['2 weken', 14 * DAY], ['3 weken', 21 * DAY], ['4 weken', 28 * DAY],
];

const command = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Een giveaway starten (je krijgt een formulier)')
  .setDMPermission(false)
  .toJSON();

// Formulier met prijs, uitleg, aantal winnaars (1-10) en duur
function giveawayForm() {
  return new ModalBuilder()
    .setCustomId('gw_form')
    .setTitle('🎁 Giveaway starten')
    .addLabelComponents(
      new LabelBuilder().setLabel('Prijs').setDescription('Wat valt er te winnen?')
        .setTextInputComponent(new TextInputBuilder().setCustomId('prijs').setStyle(TextInputStyle.Short)
          .setPlaceholder('Bijv. Discord Nitro').setMaxLength(200).setRequired(true)),
      new LabelBuilder().setLabel('Aantal winnaars')
        .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId('winnaars').setRequired(true)
          .addOptions(Array.from({ length: 10 }, (_, i) => ({
            label: `${i + 1} winnaar${i ? 's' : ''}`, value: String(i + 1), emoji: '🏆', default: i === 0,
          })))),
      new LabelBuilder().setLabel('Hoe lang duurt de giveaway?')
        .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId('duur').setRequired(true)
          .addOptions(DURATIONS.map(([label, ms]) => ({ label, value: String(ms), emoji: '⏰', default: label === '1 dag' })))),
      new LabelBuilder().setLabel('Extra uitleg').setDescription('Optioneel, bijv. voorwaarden')
        .setTextInputComponent(new TextInputBuilder().setCustomId('info').setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Bijv. Alleen voor actieve leden!').setMaxLength(500).setRequired(false)),
    );
}

const allowed = (member) => cfg.adminIds.includes(member.id)
  || member.roles.cache.some((r) => cfg.giveawayRoleIds.includes(r.id));

function embedFor(g, guild) {
  const ended = g.status === 'ended';
  const lines = [
    g.info ? `${g.info}\n` : null,
    ended ? `🏁 **Afgelopen** ${ts(g.endsAt)}` : `⏰ Eindigt ${ts(g.endsAt)} (${ts(g.endsAt, 'f')})`,
    `🏆 **${g.winners}** winnaar${g.winners === 1 ? '' : 's'}`,
    `👥 **${g.entries.length}** deelnemer${g.entries.length === 1 ? '' : 's'}`,
    `🎙️ Georganiseerd door ${anon.isHidden(g.hostId) ? 'het team' : `<@${g.hostId}>`}`,
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
      ? `🎉 Gefeliciteerd ${g.winnerIds.map((u) => `<@${u}>`).join(', ')}! Je hebt **${g.prize}** gewonnen! ${anon.isHidden(g.hostId) ? 'Maak een ticket aan om je prijs te ontvangen.' : `Neem contact op met <@${g.hostId}>.`}`
      : `😕 Niemand deed mee aan **${g.prize}**, dus er is geen winnaar.`,
    reply: msg ? { messageReference: msg.id } : undefined,
    allowedMentions: { users: [...g.winnerIds, ...(anon.isHidden(g.hostId) ? [] : [g.hostId])] },
  }).catch(() => {});
  console.log(`[giveaway] ${g.prize} afgelopen, winnaars: ${g.winnerIds.join(', ') || 'geen'}`);
}

async function start(interaction) {
  if (!allowed(interaction.member)) {
    return interaction.reply({ content: '❌ Je hebt geen toestemming om een giveaway te starten.', flags: MessageFlags.Ephemeral });
  }
  await interaction.showModal(giveawayForm());
}

async function submitForm(interaction) {
  if (!allowed(interaction.member)) {
    return interaction.reply({ content: '❌ Je hebt geen toestemming om een giveaway te starten.', flags: MessageFlags.Ephemeral });
  }
  const channel = await interaction.client.channels.fetch(cfg.giveawayChannelId).catch(() => null);
  if (!channel) return interaction.reply({ content: '❌ Ik kan het giveawaykanaal niet vinden.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ms = Number(interaction.fields.getStringSelectValues('duur')[0]) || DAY;
  const g = {
    id: newId(),
    prize: interaction.fields.getTextInputValue('prijs').trim(),
    info: interaction.fields.getTextInputValue('info').trim() || null,
    winners: Number(interaction.fields.getStringSelectValues('winnaars')[0]) || 1,
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
      else if (interaction.isModalSubmit() && interaction.customId === 'gw_form') await submitForm(interaction);
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
