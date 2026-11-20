// Staffrol automatisch geven/weghalen:
// heeft iemand één van de rollen in staffTriggerRoleIds → staffrol erbij;
// heeft hij er geen meer → staffrol weg. Bij elke start wordt iedereen één keer gecontroleerd.
const { Events } = require('discord.js');
const cfg = require('./config');

const triggers = () => cfg.staffTriggerRoleIds ?? [];
const hasTrigger = (member) => member.roles.cache.some((r) => triggers().includes(r.id));

async function sync(member) {
  const staffId = cfg.staffRoleId;
  if (!staffId || member.user.bot) return;
  const should = hasTrigger(member);
  const has = member.roles.cache.has(staffId);
  try {
    if (should && !has) {
      await member.roles.add(staffId, 'Heeft een staff-functierol');
      console.log(`[staffrol] Staffrol gegeven aan ${member.user.tag}`);
    } else if (!should && has) {
      await member.roles.remove(staffId, 'Heeft geen staff-functierol meer');
      console.log(`[staffrol] Staffrol weggehaald bij ${member.user.tag}`);
    }
  } catch (e) {
    console.warn(`[staffrol] Kon staffrol niet aanpassen bij ${member.user.tag}: ${e.message}`);
  }
}

module.exports = (client) => {
  // Bij een rolwijziging
  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    if (oldMember.roles.cache.size === newMember.roles.cache.size
      && oldMember.roles.cache.every((r) => newMember.roles.cache.has(r.id))) return;
    sync(newMember);
  });

  // Bij elke start: iedereen controleren (voor wijzigingen terwijl de bot offline was)
  client.once(Events.ClientReady, async () => {
    const channel = await client.channels.fetch(cfg.panelChannelId).catch(() => null);
    const guild = channel?.guild;
    if (!guild) return;
    try {
      const members = await guild.members.fetch();
      for (const m of members.values()) await sync(m);
      console.log('[staffrol] Iedereen gecontroleerd');
    } catch (e) {
      console.warn('[staffrol] Controle bij start mislukt:', e.message);
    }
  });
};
