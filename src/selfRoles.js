// Rollenpaneel: leden kiezen zelf welke meldingen ze willen (knop = rol aan/uit).
// De bot maakt de rollen zelf aan (zonder rechten), met een icoontje als de server dat toestaat
// (rolicoontjes kunnen pas vanaf boostlevel 2; daarom staat de emoji ook in de naam).
// Het paneel wordt bij elke start gecontroleerd en komt terug als het verwijderd wordt.
const {
  Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const cfg = require('./config');
const store = require('./store');

const FILE = 'self-roles.json';
const TITLE = '🔔  MELDINGEN';
const ROLES = [
  { key: 'changelog', name: '📋 Changelog', emoji: '📋', color: '#FFFFFF', text: 'Updates van de bot' },
  { key: 'content', name: '📡 Content', emoji: '📡', color: '#FF0000', text: 'Nieuwe video\'s en livestreams' },
  { key: 'mededelingen', name: '📢 Mededelingen', emoji: '📢', color: '#F0C14B', text: 'Belangrijk nieuws over de server' },
];

const state = () => store.load(FILE, { roles: {}, messageId: null });
const roleId = (key) => state().roles[key];

// Rollen aanmaken als ze er nog niet zijn (of verwijderd zijn)
async function ensureRoles(guild) {
  const st = state();
  await guild.roles.fetch();
  const canIcon = guild.premiumTier >= 2;
  for (const r of ROLES) {
    let role = st.roles[r.key] && guild.roles.cache.get(st.roles[r.key]);
    if (!role) role = guild.roles.cache.find((x) => x.name === r.name);
    if (!role) {
      role = await guild.roles.create({
        name: r.name,
        color: r.color,
        permissions: [], // geen rechten
        mentionable: true, // zodat de bot (en het team) deze rol kan taggen
        ...(canIcon ? { unicodeEmoji: r.emoji } : {}),
        reason: 'Meldingsrol voor het rollenpaneel',
      });
      console.log(`[rollen] Rol ${r.name} aangemaakt`);
    } else if (role.permissions.bitfield !== 0n) {
      await role.setPermissions([], 'Meldingsrol: geen rechten').catch(() => {});
    }
    st.roles[r.key] = role.id;
  }
  store.save(FILE, { ...state(), roles: st.roles });
}

function panel() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(cfg.color)
      .setTitle(TITLE)
      .setDescription([
        'Kies zelf waar je een melding van wilt krijgen.',
        'Klik op een knop om de rol te krijgen, nog een keer klikken haalt hem weer weg.',
        '',
        ...ROLES.map((r) => `${r.emoji} <@&${roleId(r.key)}> • ${r.text}`),
      ].join('\n'))],
    components: [new ActionRowBuilder().addComponents(ROLES.map((r) => new ButtonBuilder()
      .setCustomId(`selfrole:${r.key}`).setLabel(r.name.replace(/^\S+\s/, '')).setEmoji(r.emoji).setStyle(ButtonStyle.Secondary)))],
    allowedMentions: { parse: [] },
  };
}

async function check(client) {
  if (!cfg.selfRolesChannelId) return;
  try {
    const channel = await client.channels.fetch(cfg.selfRolesChannelId);
    await ensureRoles(channel.guild);
    const st = state();
    let msg = st.messageId ? await channel.messages.fetch(st.messageId).catch(() => null) : null;
    if (!msg) {
      const recent = await channel.messages.fetch({ limit: 50 });
      msg = recent.find((m) => m.author.id === client.user.id && m.embeds[0]?.title === TITLE) ?? null;
    }
    if (msg) await msg.edit(panel());
    else msg = await channel.send(panel());
    store.save(FILE, { ...state(), messageId: msg.id });
    console.log('[rollen] Rollenpaneel staat klaar');
  } catch (e) {
    console.warn('[rollen] Kon rollenpaneel niet klaarzetten:', e.message);
  }
}

async function toggle(interaction) {
  const key = interaction.customId.split(':')[1];
  const r = ROLES.find((x) => x.key === key);
  const id = roleId(key);
  const role = id && interaction.guild.roles.cache.get(id);
  if (!r || !role) return interaction.reply({ content: '❌ Deze rol bestaat niet meer. Probeer het later opnieuw.', flags: MessageFlags.Ephemeral });
  const has = interaction.member.roles.cache.has(role.id);
  try {
    if (has) await interaction.member.roles.remove(role, 'Rollenpaneel');
    else await interaction.member.roles.add(role, 'Rollenpaneel');
  } catch (e) {
    console.warn('[rollen]', e.message);
    return interaction.reply({ content: '❌ Het lukte niet om je rol aan te passen. Laat het het team weten.', flags: MessageFlags.Ephemeral });
  }
  await interaction.reply({
    content: has ? `🔕 Je krijgt geen meldingen meer voor **${r.name}**.` : `🔔 Je krijgt nu meldingen voor **${r.name}**!`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = (client) => {
  client.once(Events.ClientReady, () => check(client));
  client.on(Events.MessageDelete, (message) => {
    if (message.id === state().messageId) setTimeout(() => check(client), 2000);
  });
  // Rol verwijderd? Opnieuw aanmaken en het paneel bijwerken
  client.on(Events.GuildRoleDelete, (role) => {
    if (Object.values(state().roles).includes(role.id)) setTimeout(() => check(client), 2000);
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('selfrole:')) return;
    try { await toggle(interaction); } catch (e) { console.error('[rollen]', e); }
  });
};
module.exports.roleId = roleId;
