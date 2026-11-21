// /onderhoud: zet onderhoud aan of uit (toggle). Alleen voor de beheerders.
// Tijdens onderhoud:
//  - reageert de bot op knoppen, menu's, formulieren en commands van leden met "🔧 in onderhoud"
//    (beheerders kunnen alles gewoon blijven gebruiken)
//  - worden de woordketting en tellen tijdelijk op slot gezet, zodat er geen woorden/getallen gemist worden
//  - staat er 🟠 ONDERHOUD in het statuskanaal en "🔧 Onderhoud" als status van de bot
// Welkomstberichten, rollen bij joinen en de automatische staffrol blijven gewoon werken.
// Onderhoud blijft aan na een herstart, tot je het zelf weer uitzet.
const { Events, SlashCommandBuilder, MessageFlags, ActivityType } = require('discord.js');
const cfg = require('./config');
const store = require('./store');

const FILE = 'maintenance.json';
const state = () => store.load(FILE, { on: false, locks: {} });
const isOn = () => state().on;
const isAdmin = (id) => cfg.adminIds.includes(id);
const lockChannels = () => [cfg.wordChainChannelId, cfg.countingChannelId].filter(Boolean);

const command = new SlashCommandBuilder()
  .setName('onderhoud')
  .setDescription('Onderhoud aan- of uitzetten')
  .setDMPermission(false)
  .toJSON();

function setPresence(client, on) {
  if (on) client.user?.setPresence({ status: 'dnd', activities: [{ type: ActivityType.Custom, name: 'custom', state: '🔧 Onderhoud' }] });
  else require('./presence').update(client); // weer de ledenteller tonen
}

// Woordketting en tellen op slot (en daarna precies terugzetten zoals het was)
async function lock(client, on) {
  const st = state();
  for (const id of lockChannels()) {
    const channel = await client.channels.fetch(id).catch(() => null);
    if (!channel) continue;
    const everyone = channel.guild.roles.everyone;
    try {
      if (on) {
        const ow = channel.permissionOverwrites.cache.get(everyone.id);
        // Vorige instelling onthouden: true (toegestaan), false (verboden) of null (niet ingesteld)
        st.locks[id] = ow?.allow.has('SendMessages') ? true : ow?.deny.has('SendMessages') ? false : null;
        await channel.permissionOverwrites.edit(everyone, { SendMessages: false }, { reason: 'Onderhoud' });
        await channel.send('🔧 **Onderhoud**: dit kanaal staat even op slot. Zo is de bot weer terug!').catch(() => {});
      } else {
        const prev = id in st.locks ? st.locks[id] : null;
        await channel.permissionOverwrites.edit(everyone, { SendMessages: prev }, { reason: 'Onderhoud voorbij' });
        delete st.locks[id];
        await channel.send('✅ **Onderhoud voorbij**: je kunt weer verder!').catch(() => {});
      }
    } catch (e) {
      console.warn(`[onderhoud] Kon #${channel.name} niet ${on ? 'op slot zetten' : 'openen'}: ${e.message}`);
    }
  }
  store.save(FILE, { ...state(), locks: st.locks });
}

async function toggle(interaction) {
  if (!isAdmin(interaction.user.id)) {
    return interaction.reply({ content: '❌ Alleen de beheerders kunnen onderhoud aan- of uitzetten.', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const on = !isOn();
  store.save(FILE, { ...state(), on, since: Date.now(), by: interaction.user.id });
  setPresence(interaction.client, on);
  await lock(interaction.client, on);
  await require('./status').maintenance(on, interaction.user);
  console.log(`[onderhoud] ${on ? 'AAN' : 'UIT'} door ${interaction.user.tag}`);
  await interaction.editReply(on
    ? '🔧 **Onderhoud staat AAN.** Leden kunnen de bot nu niet gebruiken; jij wel. Typ nog een keer `/onderhoud` om het uit te zetten.'
    : '✅ **Onderhoud staat UIT.** Alles werkt weer voor iedereen.');
}

const BLOCKED = { content: '🔧 De bot is even **in onderhoud**. Probeer het later opnieuw!', flags: MessageFlags.Ephemeral };

module.exports = (client) => {
  // Alle interacties van leden tegenhouden tijdens onderhoud (voordat de andere onderdelen ze zien)
  const emit = client.emit.bind(client);
  client.emit = (event, ...args) => {
    if (isOn()) {
      if (event === Events.InteractionCreate) {
        const i = args[0];
        const isToggle = i.isChatInputCommand?.() && i.commandName === 'onderhoud';
        if (!isToggle && !isAdmin(i.user.id)) {
          if (i.isAutocomplete?.()) return true;
          if (i.isRepliable?.()) i.reply(BLOCKED).catch(() => {});
          return true;
        }
      }
      // Berichten in de woordketting en bij tellen niet verwerken (kanalen staan op slot)
      if (event === Events.MessageCreate && lockChannels().includes(args[0]?.channelId) && !isAdmin(args[0]?.author?.id)) return true;
    }
    return emit(event, ...args);
  };

  client.once(Events.ClientReady, () => {
    if (isOn()) {
      setPresence(client, true);
      console.log('[onderhoud] Onderhoud staat nog AAN');
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'onderhoud') return;
    try { await toggle(interaction); } catch (e) {
      console.error('[onderhoud]', e);
      const m = { content: '❌ Er ging iets mis.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) interaction.editReply(m).catch(() => {});
      else interaction.reply(m).catch(() => {});
    }
  });
};
module.exports.command = command;
module.exports.isOn = isOn;
