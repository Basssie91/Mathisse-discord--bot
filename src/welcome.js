// Welkomstbericht als iemand de server joint
const path = require('node:path');
const { Events, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const cfg = require('./config');

const BANNER_FILE = 'banner.png';
const BANNER_PATH = path.join(__dirname, '..', 'assets', BANNER_FILE);

async function sendWelcome(member) {
  const channel = await member.client.channels.fetch(cfg.welcomeChannelId).catch(() => null);
  if (!channel) return console.warn('[welkom] Welkomstkanaal niet gevonden, check welcomeChannelId in src/config.js');

  const { guild } = member;
  const lines = [
    `Hey ${member}, welkom in **${guild.name}**! 🎉`,
    `Je bent ons **${guild.memberCount}e** lid.`,
  ];
  const tips = [
    cfg.rulesChannelId && `📜 Lees eerst de regels in <#${cfg.rulesChannelId}>`,
    cfg.panelChannelId && `🎫 Vragen? Maak een ticket in <#${cfg.panelChannelId}>`,
  ].filter(Boolean);
  if (tips.length) lines.push('', ...tips);

  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
    .setTitle(`👋  Welkom, ${member.displayName}!`)
    .setDescription(lines.join('\n'))
    .setThumbnail(member.displayAvatarURL({ size: 256 }))
    .setImage(`attachment://${BANNER_FILE}`)
    .setFooter({ text: `Veel plezier in ${guild.name}!`, iconURL: guild.iconURL({ size: 64 }) ?? undefined })
    .setTimestamp();

  try {
    await channel.send({
      content: `${member}`,
      embeds: [embed],
      files: [new AttachmentBuilder(BANNER_PATH, { name: BANNER_FILE })],
      allowedMentions: { users: [member.id] },
    });
    console.log(`[welkom] Welkomstbericht voor ${member.user.tag}`);
  } catch (e) {
    console.warn('[welkom] Kon welkomstbericht niet sturen:', e.message);
  }
}

module.exports = (client) => {
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;
    // Rol geven bij joinen
    if (cfg.joinRoleId) {
      await member.roles.add(cfg.joinRoleId, 'Rol bij joinen')
        .then(() => console.log(`[welkom] Rol gegeven aan ${member.user.tag}`))
        .catch((e) => console.warn(`[welkom] Kon geen rol geven aan ${member.user.tag}: ${e.message}`));
    }
    sendWelcome(member);
  });
};
