const fs = require('node:fs');
const path = require('node:path');
const {
  Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, SlashCommandBuilder,
} = require('discord.js');

// Herinnering om de gratis server bij Bot-Hosting te verlengen (gratis plan: elke 4 dagen)
const RENEW_URL = 'https://bot-hosting.net/a/billings';
const FIRST_AFTER = 3 * 24 * 60 * 60 * 1000; // 3 dagen na het klikken op 'Ik heb verlengd'
const REPEAT = 12 * 60 * 60 * 1000;          // daarna elke 12 uur tot iemand op de knop klikt
const FILE = path.join(__dirname, 'data', 'renewal.json');

const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; } };
const save = (v) => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(v)); };

// Eerste keer: we gaan ervan uit dat er net verlengd is
let state = load() ?? { lastRenewed: Date.now(), lastReminder: 0, nextAt: Date.now() + FIRST_AFTER };
save(state);

const ts = (ms, f = 'f') => `<t:${Math.floor(ms / 1000)}:${f}>`;
const nextReminderAt = () => Math.max(state.nextAt ?? 0, state.lastReminder ? state.lastReminder + REPEAT : 0);

const command = new SlashCommandBuilder()
  .setName('verlengen')
  .setDescription('Status van de verlenging bij Bot-Hosting')
  .toJSON();

module.exports = (client, ownerIds) => {
  const reminderEmbed = () => new EmbedBuilder()
    .setColor('#FEE75C')
    .setTitle('🔔  Vergeet niet te verlengen!')
    .setDescription([
      'De gratis server bij **Bot-Hosting** moet verlengd worden, anders gaat de bot offline.',
      '',
      `Laatst verlengd: ${ts(state.lastRenewed)} (${ts(state.lastRenewed, 'R')})`,
      '',
      '1. Klik op **Verlengen** hieronder',
      '2. Klik op **Renew free plan** → **Renew for 4 days**',
      '3. Klik daarna hier op **✅ Ik heb verlengd**',
    ].join('\n'))
    .setTimestamp();

  const buttons = (withTest = false) => {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Verlengen').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(RENEW_URL),
      new ButtonBuilder().setCustomId('renew_done').setLabel('Ik heb verlengd').setEmoji('✅').setStyle(ButtonStyle.Success),
    );
    if (withTest) {
      row.addComponents(
        new ButtonBuilder().setCustomId('renew_test').setLabel('Herinnering nu sturen').setEmoji('📨').setStyle(ButtonStyle.Secondary),
      );
    }
    return [row];
  };

  // Stuurt de herinnering als DM naar alle eigenaren; true als het bij minstens één lukte
  async function sendReminder() {
    let sent = 0;
    for (const id of ownerIds) {
      try {
        const user = await client.users.fetch(id);
        await user.send({ embeds: [reminderEmbed()], components: buttons() });
        sent++;
      } catch (e) {
        console.warn(`[verlengen] Kon geen DM sturen naar ${id}:`, e.message);
      }
    }
    return sent > 0;
  }

  async function remind() {
    if (Date.now() < nextReminderAt()) return;
    if (await sendReminder()) {
      state.lastReminder = Date.now();
      save(state);
      console.log('[verlengen] Herinnering gestuurd');
    }
  }

  client.once(Events.ClientReady, () => {
    remind();
    setInterval(remind, 10 * 60 * 1000).unref();
    console.log(`[verlengen] Volgende herinnering rond ${new Date(nextReminderAt()).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    const isOwner = ownerIds.includes(interaction.user.id);

    // /verlengen: status + knoppen
    if (interaction.isChatInputCommand() && interaction.commandName === 'verlengen') {
      if (!isOwner) return interaction.reply({ content: '❌ Dit is niet voor jou.', flags: MessageFlags.Ephemeral });
      const next = nextReminderAt();
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#FFFFFF')
          .setTitle('📅  Verlengen bij Bot-Hosting')
          .setDescription([
            `✅ Laatst verlengd: ${ts(state.lastRenewed)} (${ts(state.lastRenewed, 'R')})`,
            `🔔 Volgende herinnering: ${ts(next)} (${ts(next, 'R')})`,
            '',
            '1. Klik op **Verlengen** en kies **Renew free plan** → **Renew for 4 days**',
            '2. Klik daarna op **✅ Ik heb verlengd**: de teller begint dan opnieuw op 3 dagen',
          ].join('\n'))],
        components: buttons(true),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.isButton()) return;

    if (interaction.customId === 'renew_test') {
      if (!isOwner) return interaction.reply({ content: '❌ Dit is niet voor jou.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const ok = await sendReminder();
      return interaction.reply({
        content: ok ? '📨 Herinnering gestuurd! Kijk in je DM. De teller is niet veranderd.' : '❌ Kon geen DM sturen. Staan je DM\'s open?',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }

    if (interaction.customId === 'renew_done') {
      if (!isOwner) return interaction.reply({ content: '❌ Dit is niet voor jou.', flags: MessageFlags.Ephemeral }).catch(() => {});
      state = { lastRenewed: Date.now(), lastReminder: 0, nextAt: Date.now() + FIRST_AFTER };
      save(state);
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setColor('#57F287')
          .setTitle('✅  Verlengd!')
          .setDescription(`Top! De volgende herinnering komt ${ts(state.nextAt)} (${ts(state.nextAt, 'R')}).`)],
        components: [],
      }).catch(() => {});
      console.log(`[verlengen] Verlenging bevestigd door ${interaction.user.tag}`);
    }
  });
};

module.exports.command = command;
