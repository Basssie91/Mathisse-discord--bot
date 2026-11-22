// Staff-overzicht: embed met alle commands en wie ze mag gebruiken.
// Wordt bij elke start opnieuw opgebouwd uit de commands van de bot (nieuwe commands komen er vanzelf bij)
// en teruggezet als het bericht weg is, net als het ticketpaneel en de botstatus.
const { Events, EmbedBuilder } = require('discord.js');
const cfg = require('./config');
const store = require('./store');

const TITLE = '🛡️  STAFF • COMMANDS & RECHTEN';
const FILE = 'staff-overview.json';

// superUserIds (Bas) hebben overal toegang, maar worden in het overzicht niet genoemd
const hidden = () => cfg.superUserIds ?? [];
const users = (ids = []) => ids.filter((id) => !hidden().includes(id)).map((id) => `<@${id}>`);
const roles = (ids = []) => ids.filter(Boolean).map((id) => `<@&${id}>`);
const who = (...parts) => [...new Set(parts.flat())].join(', ') || 'Niemand';
const admins = () => users(cfg.adminIds);

// Wie mag welk command gebruiken (ontbreekt een command hier, dan komt het onder "Overig")
const ACCESS = {
  commands: () => '👥 Iedereen',
  verjaardag: () => '👥 Iedereen',
  resetverjaardag: () => who(roles([cfg.staffRoleId, cfg.bestuurRoleId]), admins()),
  opruimen: () => who(roles(cfg.purgeRoleIds), users(cfg.purgeUserIds)),
  giveaway: () => who(roles(cfg.giveawayRoleIds), admins()),
  'staff-update': () => who(roles(cfg.staffUpdateRoleIds), admins()),
  changelog: () => who(admins()),
  content: () => who(admins()),
  'content-lijst': () => who(admins()),
  verlengen: () => who(admins()),
  restart: () => who(admins()),
  onderhoud: () => who(admins()),
};

// Korte uitleg per command (anders de omschrijving van het command zelf)
const SHORT = {
  commands: 'Overzicht voor leden',
  verjaardag: 'Verjaardag invullen (1×)',
  resetverjaardag: 'Verjaardag van een lid wissen',
  opruimen: 'Berichten verwijderen',
  giveaway: 'Giveaway starten',
  'staff-update': 'Aanname, promotie, degradatie of ontslag',
  changelog: 'Changelog plaatsen',
  content: 'YouTuber/streamer toevoegen',
  'content-lijst': 'Contentmeldingen beheren',
  verlengen: 'Verlenging bij Bot-Hosting',
  restart: 'Bot herstarten',
  onderhoud: 'Onderhoud aan/uit',
};

// Groep op basis van wie het mag: iedereen / team (met rol) / beheerders (alleen personen)
function groupOf(access) {
  if (access.includes('Iedereen')) return '👥  Iedereen';
  if (access.includes('<@&')) return '🛡️  Team';
  return '👑  Beheerders';
}
const ORDER = ['👥  Iedereen', '🛡️  Team', '👑  Beheerders', '➕  Overig'];

function buildEmbed(client, guild) {
  const cmds = [...client.application.commands.cache.values()].sort((a, b) => a.name.localeCompare(b.name));
  const groups = new Map();
  for (const c of cmds) {
    const access = ACCESS[c.name] ? ACCESS[c.name]() : null;
    const name = access ? groupOf(access) : '➕  Overig';
    if (!groups.has(name)) groups.set(name, { access, lines: [] });
    groups.get(name).lines.push(`</${c.name}:${c.id}> ${SHORT[c.name] ?? c.description}`);
  }

  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
    .setTitle(TITLE)
    .setDescription('Welke commands er zijn en wie ze kan gebruiken.\n-# Wordt automatisch bijgewerkt.');

  for (const name of ORDER.filter((n) => groups.has(n))) {
    const g = groups.get(name);
    const whoLine = name === '👥  Iedereen' ? null : `-# 🔑 ${g.access ?? 'Zie de bot'}`;
    embed.addFields({ name, value: [whoLine, ...g.lines].filter(Boolean).join('\n').slice(0, 1024) });
  }

  const teamRoles = who(roles([cfg.staffRoleId, cfg.bestuurRoleId]));
  embed.addFields(
    {
      name: '🎫  Tickets',
      value: [
        `-# 🔑 ${teamRoles}`,
        '**Vragen** oppakken en sluiten',
        `**Bestuur** alleen ${who(roles([cfg.bestuurRoleId]))}`,
        `**Thumbnail** ${who(roles([cfg.staffRoleId]))}`,
      ].join('\n').slice(0, 1024),
    },
    {
      name: '🔘  Overige knoppen',
      value: [
        `-# 🔑 ${who(admins())}`,
        '**Sollicitaties** accepteren of afwijzen',
        '**Partneraanvragen** accepteren of afwijzen',
        '**Suggesties** goedkeuren of afwijzen',

        `-# 🔑 ${who(roles(cfg.giveawayRoleIds), admins())}`,
        '**Giveaway** beëindigen of nieuwe winnaar',
      ].join('\n').slice(0, 1024),
    },
  )
    .setFooter({ text: 'Laatst bijgewerkt' })
    .setTimestamp();
  return embed;
}

async function check(client) {
  if (!cfg.staffOverviewChannelId) return;
  try {
    await client.application.commands.fetch();
    const channel = await client.channels.fetch(cfg.staffOverviewChannelId);
    const embed = buildEmbed(client, channel.guild);
    const saved = store.load(FILE, {});
    let msg = saved.messageId ? await channel.messages.fetch(saved.messageId).catch(() => null) : null;
    if (!msg) {
      const recent = await channel.messages.fetch({ limit: 50 });
      msg = recent.find((m) => m.author.id === client.user.id && m.embeds[0]?.title === TITLE) ?? null;
    }
    if (msg) await msg.edit({ embeds: [embed], allowedMentions: { parse: [] } });
    else msg = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    store.save(FILE, { messageId: msg.id });
    console.log('[staff-overzicht] Bijgewerkt');
  } catch (e) {
    console.warn('[staff-overzicht] Kon overzicht niet bijwerken:', e.message);
  }
}

module.exports = (client) => {
  // Even wachten tot de commands geregistreerd zijn
  client.once(Events.ClientReady, () => setTimeout(() => check(client), 5000));
  client.on(Events.MessageDelete, (message) => {
    if (message.id === store.load(FILE, {}).messageId) {
      console.log('[staff-overzicht] Verwijderd, ik plaats het opnieuw');
      setTimeout(() => check(client), 2000);
    }
  });
};
