// Mathisse Discord bot
// - Komt online met de token uit DISCORD_TOKEN
// - /restart: alleen voor de gebruikers in ALLOWED_RESTART_IDS
require('dotenv').config();
const { Client, GatewayIntentBits, Events, SlashCommandBuilder, MessageFlags } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const BH_API_KEY = process.env.BOTHOSTING_API_KEY;
const BH_DEPLOYMENT_ID = process.env.BOTHOSTING_DEPLOYMENT_ID; // bv. dep_a1b2c3d4 (optioneel)
const BH_API = 'https://bot-hosting.net/api/v1';

// Alleen deze Discord-gebruikers mogen /restart gebruiken
const ALLOWED_RESTART_IDS = ['1057307298894196756', '1506618917324460114'];

if (!TOKEN) {
  console.error('DISCORD_TOKEN ontbreekt. Zet hem in .env of in de omgevingsvariabelen van Bot-Hosting.');
  process.exit(1);
}

// MessageContent is nodig zodat transcripts de tekst van berichten bevatten
// GuildMembers is nodig voor het welkomstbericht
// (zet 'Message Content Intent' en 'Server Members Intent' aan in de Discord Developer Portal → Bot)
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
// De bot heeft veel onderdelen die elk naar dezelfde gebeurtenissen luisteren; dat is bewust (geen geheugenlek)
client.setMaxListeners(50);

// Onderhoud (/onderhoud): moet als eerste, zodat het interacties van leden kan tegenhouden
require('./src/maintenance')(client);

const renewReminder = require('./renewReminder');

const commands = [
  new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Herstart de bot (alleen voor beheerders van de bot)')
    .toJSON(),
  renewReminder.command,
  require('./src/updates').command,
  require('./src/purge').command,
  require('./src/giveaway').command,
  require('./src/content').command,
  require('./src/content').listCommand,
  require('./src/staffUpdate').command,
  require('./src/help').command,
  require('./src/maintenance').command,
];

// Ticketsysteem: menu met Vragen, Bestuur, Staff sollicitatie en Partner aanvraag
require('./src/tickets')(client);
require('./src/applications')(client);
require('./src/partners')(client);

// Welkomstbericht voor nieuwe leden
require('./src/welcome')(client);

// Regels-embed in het regelskanaal (komt terug als hij weg is)
require('./src/rules')(client);

// Updates automatisch in het updatekanaal plaatsen
require('./src/updates')(client);

// /opruimen
require('./src/purge')(client);

// /giveaway
require('./src/giveaway')(client);

// Woordketting (haalt gemiste woorden in na een herstart)
require('./src/wordchain')(client);

// Tellen (haalt gemiste getallen in na een herstart)
require('./src/counting')(client);

// Contentmeldingen (YouTube, Twitch, Kick)
require('./src/content')(client);

// /staff-update
require('./src/staffUpdate')(client);

// Staffrol automatisch geven/weghalen op basis van functierollen
require('./src/staffRole')(client);

// /commands (overzicht voor iedereen)
require('./src/help')(client);

// Suggestiepaneel
require('./src/suggestions')(client);

// Rollenpaneel (meldingsrollen)
require('./src/selfRoles')(client);

// Staff-overzicht van alle commands en rechten
require('./src/staffOverview')(client);

// Botstatus in het statuskanaal
const status = require('./src/status');
status(client);

// Verlengingsherinnering
renewReminder(client, {
  notifyIds: ['1506618917324460114'], // krijgt de DM-herinnering
  allowedIds: ['1057307298894196756', '1506618917324460114'], // mag /verlengen en de knoppen gebruiken
});

// Zoekt het deployment-id op als het niet is ingesteld
async function getDeploymentId() {
  if (BH_DEPLOYMENT_ID) return BH_DEPLOYMENT_ID;
  const res = await fetch(`${BH_API}/deployments?brief=true`, {
    headers: { Authorization: `Bearer ${BH_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Deployments ophalen mislukt (${res.status})`);
  const data = await res.json();
  const list = data.deployments || [];
  if (list.length !== 1) {
    throw new Error(`Er zijn ${list.length} deployments gevonden; zet BOTHOSTING_DEPLOYMENT_ID.`);
  }
  return list[0].id;
}

async function restartViaBotHosting() {
  const id = await getDeploymentId();
  const res = await fetch(`${BH_API}/deployments/${id}/power`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${BH_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'restart', waitSeconds: 0 }),
  });
  if (!res.ok) throw new Error(`Restart-verzoek mislukt (${res.status}): ${await res.text()}`);
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Online als ${c.user.tag}`);
  try {
    await c.application.commands.set(commands);
    console.log('Slash commands geregistreerd.');
  } catch (err) {
    console.error('Slash commands registreren mislukt:', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'restart') {
    if (!ALLOWED_RESTART_IDS.includes(interaction.user.id)) {
      return interaction.reply({
        content: 'Je hebt geen toestemming om de bot te herstarten.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply({ content: '🔄 Bot wordt herstart...', flags: MessageFlags.Ephemeral });
    console.log(`/restart door ${interaction.user.tag} (${interaction.user.id})`);
    await status.restarting(interaction.user);

    if (BH_API_KEY) {
      try {
        await restartViaBotHosting();
        return; // Bot-Hosting stopt en start het proces zelf
      } catch (err) {
        console.error(err);
        await status.failed(err.message);
        await interaction.followUp({
          content: `Herstart via Bot-Hosting mislukt: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
      }
    }

    // Geen API-key: proces afsluiten en laten herstarten door de host
    client.destroy().finally(() => process.exit(0));
  }
});

client.login(TOKEN);
