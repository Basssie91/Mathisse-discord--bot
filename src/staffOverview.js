// Staff-overzicht: embed met alle commands en wie ze mag gebruiken.
// Wordt bij elke start opnieuw opgebouwd uit de commands van de bot (nieuwe commands komen er vanzelf bij)
// en teruggezet als het bericht weg is, net als het ticketpaneel en de botstatus.
const { Events, EmbedBuilder } = require('discord.js');
const cfg = require('./config');
const store = require('./store');

const TITLE = '🛡️  STAFF • COMMANDS & RECHTEN';
const FILE = 'staff-overview.json';

const users = (ids = []) => ids.map((id) => `<@${id}>`);
const roles = (ids = []) => ids.filter(Boolean).map((id) => `<@&${id}>`);
const who = (...parts) => [...new Set(parts.flat())].join(', ') || 'Niemand';
const admins = () => users(cfg.adminIds);

// Wie mag welk command gebruiken (ontbreekt een command hier, dan komt het onder "Overig")
const ACCESS = {
  commands: () => '👥 Iedereen',
  opruimen: () => who(roles(cfg.purgeRoleIds), users(cfg.purgeUserIds)),
  giveaway: () => who(roles(cfg.giveawayRoleIds), admins()),
  'staff-update': () => who(roles(cfg.staffUpdateRoleIds), admins()),
  changelog: () => who(admins()),
  content: () => who(admins()),
  'content-lijst': () => who(admins()),
  verlengen: () => who(admins()),
  restart: () => who(admins()),
};

function buildEmbed(client, guild) {
  const cmds = [...client.application.commands.cache.values()].sort((a, b) => a.name.localeCompare(b.name));
  const line = (c) => `</${c.name}:${c.id}> • ${c.description}\n-# 🔑 ${ACCESS[c.name] ? ACCESS[c.name]() : 'Zie de bot'}`;
  const known = cmds.filter((c) => ACCESS[c.name]);
  const other = cmds.filter((c) => !ACCESS[c.name]);

  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
    .setTitle(TITLE)
    // Commands in de beschrijving: daar past veel meer tekst in dan in een veld
    .setDescription([
      'Alle commands van de bot en wie ze kan gebruiken. Dit overzicht wordt automatisch bijgewerkt.',
      '',
      '**⌨️ Commands**',
      ...known.map(line),
      ...(other.length ? ['', '**➕ Overig**', ...other.map(line)] : []),
    ].join('\n').slice(0, 4000));

  embed.addFields({
    name: '🔘 Knoppen',
    value: [
      `🎫 **Ticket oppakken / sluiten** • ${roles([cfg.staffRoleId, cfg.bestuurRoleId]).length ? who(roles([cfg.staffRoleId, cfg.bestuurRoleId])) : 'Leden met Beheerder-rechten'}${cfg.bestuurRoleId ? ` (Bestuur-tickets: alleen ${who(roles([cfg.bestuurRoleId]))})` : ''}`,
      `🛡️ **Sollicitaties afhandelen** • ${who(admins())}`,
      `🤝 **Partneraanvragen afhandelen** • ${who(admins())}`,
      `🎁 **Giveaway beëindigen / nieuwe winnaar** • ${who(roles(cfg.giveawayRoleIds), admins())}`,
    ].join('\n').slice(0, 1024),
  })
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
