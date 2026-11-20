// ============================================================
//  UPDATES
//  Elke wijziging aan de bot komt hier als nieuwe regel bij (onderaan, met een nieuw versienummer).
//  Bij elke start plaatst de bot updates die nog niet in het updatekanaal staan.
//  De bot kijkt in het kanaal zelf welke versies er al staan, dus niets wordt dubbel geplaatst.
// ============================================================
const path = require('node:path');
const { Events, EmbedBuilder, AttachmentBuilder } = require('discord.js');

const CHANNEL_ID = '1569359142722867467';
const AUTHOR_ID = '1057307298894196756'; // Bas: staat bij elke update
const COLOR = '#F0C14B';
const BANNER_FILE = 'banner.png';
const BANNER_PATH = path.join(__dirname, '..', 'assets', BANNER_FILE);

const updates = [
  {
    version: 'v1.0',
    title: '🚀 De bot is online',
    sections: {
      '⚙️ Bot': [
        'De bot draait nu **24/7** op Bot-Hosting',
        'Nieuw: **/restart** om de bot vanuit Discord te herstarten (alleen voor beheerders)',
      ],
    },
  },
  {
    version: 'v1.1',
    title: '🔔 Verlengingsherinnering',
    sections: {
      '⚙️ Bot': [
        'De eigenaar krijgt een **DM** als de server bij Bot-Hosting verlengd moet worden',
        'Nieuw: **/verlengen** laat zien wanneer er voor het laatst verlengd is',
      ],
    },
  },
  {
    version: 'v1.2',
    title: '🎫 Ticketsysteem',
    sections: {
      '🎫 Tickets': [
        'Nieuw **ticketpaneel** met een uitklapmenu',
        '❓ **Vragen** en 👑 **Bestuur** openen een privé ticketkanaal',
        'Tickets kunnen **opgepakt** worden en sluiten kan alleen met een **reden**',
        'Bij sluiten krijg je het hele gesprek als **transcript** in je DM',
      ],
      '📝 Aanvragen': [
        '🛡️ **Staff sollicitatie** via een formulier',
        '🤝 **Partner aanvraag** via een formulier, de uitnodigingslink wordt gecontroleerd',
      ],
    },
  },
  {
    version: 'v1.3',
    title: '🛠️ Ticketpaneel altijd aanwezig',
    sections: {
      '🎫 Tickets': [
        'Na elke herstart controleert de bot of het **ticketpaneel** er nog staat en zet het anders terug',
        'Wordt het paneel verwijderd, dan staat het binnen een paar seconden weer terug',
      ],
    },
  },
  {
    version: 'v1.4',
    title: '📢 Updatekanaal',
    sections: {
      '⚙️ Bot': [
        'Elke update van de bot verschijnt vanaf nu automatisch **in dit kanaal**',
      ],
    },
  },
];

function buildEmbed(guild, author, u) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: `📋  UPDATE • ${guild.name}`, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
    .setTitle(`${u.version} • ${u.title}`)
    .setDescription(`Update van <t:${Math.floor(Date.now() / 1000)}:D>\n👤 Gemaakt door ${author ? `${author}` : `<@${AUTHOR_ID}>`}`)
    .addFields(Object.entries(u.sections).map(([name, items]) => ({
      name, value: items.map((t) => `• ${t}`).join('\n').slice(0, 1024),
    })))
    .setThumbnail(author?.displayAvatarURL({ size: 128 }) ?? null)
    .setImage(`attachment://${BANNER_FILE}`)
    .setFooter({ text: author ? `Update door ${author.username}` : 'Update', iconURL: author?.displayAvatarURL({ size: 64 }) })
    .setTimestamp();
}

async function postNew(client) {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    // Welke versies staan er al? (titels van berichten van de bot)
    const recent = await channel.messages.fetch({ limit: 100 });
    const posted = new Set(recent
      .filter((m) => m.author.id === client.user.id)
      .map((m) => m.embeds[0]?.title?.split(' • ')[0])
      .filter(Boolean));
    const todo = updates.filter((u) => !posted.has(u.version));
    if (!todo.length) return console.log('[updates] Geen nieuwe updates');

    const author = await client.users.fetch(AUTHOR_ID).catch(() => null);
    for (const u of todo) {
      await channel.send({
        embeds: [buildEmbed(channel.guild, author, u)],
        files: [new AttachmentBuilder(BANNER_PATH, { name: BANNER_FILE })],
        allowedMentions: { parse: [] }, // jouw naam staat erbij, maar zonder ping
      });
      console.log(`[updates] ${u.version} geplaatst`);
    }
  } catch (e) {
    console.warn('[updates] Kon updates niet plaatsen:', e.message);
  }
}

module.exports = (client) => {
  client.once(Events.ClientReady, () => postNew(client));
};
