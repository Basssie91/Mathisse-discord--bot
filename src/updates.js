// ============================================================
//  UPDATES
//  Elke kleine wijziging aan de bot komt hier als nieuwe regel bij (onderaan).
//  Bij elke start plaatst de bot de updates die nog niet in het updatekanaal staan,
//  elk als een klein embed: "(Categorie): tekst", met het account van Bas eronder.
//  De bot kijkt in het kanaal zelf wat er al staat, dus niets wordt dubbel geplaatst.
//  Wijzig of verwijder geen regels die al geplaatst zijn (dan wordt hij opnieuw geplaatst).
// ============================================================
const { Events, EmbedBuilder } = require('discord.js');

const CHANNEL_ID = '1569359142722867467';
const AUTHOR_ID = '1057307298894196756'; // Bas: staat onder elke update
const COLOR = '#3B8BEB';

const updates = [
  ['Bot', 'De bot draait nu 24/7 op Bot-Hosting.'],
  ['Commands', 'Nieuw command /restart om de bot vanuit Discord te herstarten.'],
  ['Bot', 'De eigenaar krijgt een DM wanneer de server bij Bot-Hosting verlengd moet worden.'],
  ['Commands', 'Nieuw command /verlengen met de status van de verlenging.'],
  ['Tickets', 'Ticketpaneel met uitklapmenu toegevoegd: Vragen en Bestuur openen een privé ticket.'],
  ['Tickets', 'Staff sollicitaties gaan nu via een formulier in het ticketmenu.'],
  ['Tickets', 'Partneraanvragen gaan nu via een formulier, de uitnodigingslink wordt automatisch gecontroleerd.'],
  ['Tickets', 'Bij het sluiten van een ticket krijg je het hele gesprek als transcript in je DM.'],
  ['Tickets', 'Het ticketpaneel wordt na een herstart automatisch teruggezet als het weg is.'],
  ['Updates', 'Elke update van de bot verschijnt nu automatisch in dit kanaal.'],
];

const textOf = ([category, text]) => `(${category}): ${text}`;

async function postNew(client) {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    // Wat staat er al? (beschrijvingen van berichten van de bot)
    const recent = await channel.messages.fetch({ limit: 100 });
    const posted = new Set(recent
      .filter((m) => m.author.id === client.user.id)
      .map((m) => m.embeds[0]?.description)
      .filter(Boolean));
    const todo = updates.filter((u) => !posted.has(textOf(u)));
    if (!todo.length) return console.log('[updates] Geen nieuwe updates');

    const author = await client.users.fetch(AUTHOR_ID).catch(() => null);
    for (const u of todo) {
      const embed = new EmbedBuilder().setColor(COLOR).setDescription(textOf(u));
      if (author) embed.setFooter({ text: author.globalName ?? author.username, iconURL: author.displayAvatarURL({ size: 64 }) });
      await channel.send({ embeds: [embed] });
      console.log(`[updates] Geplaatst: ${textOf(u)}`);
    }
  } catch (e) {
    console.warn('[updates] Kon updates niet plaatsen:', e.message);
  }
}

module.exports = (client) => {
  client.once(Events.ClientReady, () => postNew(client));
};
