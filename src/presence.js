// Ledenteller als status van de bot in de ledenlijst, bijv. "👥 245 leden".
// Tijdens onderhoud laat de bot "🔧 Onderhoud" zien (dat regelt src/maintenance.js).
const { Events, ActivityType } = require('discord.js');
const cfg = require('./config');

function update(client) {
  if (require('./maintenance').isOn()) return;
  const guild = client.channels.cache.get(cfg.statusChannelId ?? cfg.panelChannelId)?.guild;
  if (!guild) return;
  client.user.setPresence({
    status: 'online',
    activities: [{ type: ActivityType.Custom, name: 'custom', state: `👥 ${guild.memberCount} leden` }],
  });
}

module.exports = (client) => {
  let timer = null;
  // Bij joinen/vertrekken na een paar seconden bijwerken (niet bij elke join apart)
  const soon = () => { clearTimeout(timer); timer = setTimeout(() => update(client), 5000); };
  client.once(Events.ClientReady, () => {
    update(client);
    setInterval(() => update(client), 5 * 60 * 1000).unref();
  });
  client.on(Events.GuildMemberAdd, soon);
  client.on(Events.GuildMemberRemove, soon);
};
module.exports.update = update;
