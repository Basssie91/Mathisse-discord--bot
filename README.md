# Mathisse-discord--bot

Discord-bot (discord.js v14) gehost op Bot-Hosting.

## Commands
- `/restart` – herstart de bot. Alleen te gebruiken door de Discord-ID's in `ALLOWED_RESTART_IDS` in `index.js`.
- `/verlengen` – status van de verlenging bij Bot-Hosting, met knoppen (voor de gebruikers in `allowedIds` in `index.js`).

- `/changelog` – zelf een update plaatsen in het updatekanaal (formulier met categorie en wijziging; alleen beheerders uit `src/config.js`).

## Ticketsysteem
Paneel met een uitklapmenu:
- ❓ **Vragen** → privé ticketkanaal (staffrol + bestuurrol)
- 👑 **Bestuur** → privé ticketkanaal (alleen bestuurrol)
- 🛡️ **Staff sollicitatie** → formulier, komt binnen in het sollicitatiekanaal (accepteren = zelf een rol kiezen, afwijzen = reden + 7 dagen wachttijd)
- 🤝 **Partner aanvraag** → formulier met controle van de invite, komt binnen in het aanvraagkanaal (accepteren = plaatsen in partnerkanaal + partnerrol)

Tickets hebben **🙋 Oppakken** en **🔒 Sluiten** (met verplichte reden). Bij sluiten komt er een HTML-transcript in het transcriptkanaal en in de DM van de maker.
Alle instellingen (kanalen, rollen, eigenaar, vragen van de sollicitatie) staan in `src/config.js`. Bij elke start controleert de bot of het paneel er nog staat en plaatst het anders opnieuw; wordt het paneel verwijderd, dan zet de bot het meteen terug.

**Let op:** zet in de Discord Developer Portal → Bot de **Message Content Intent** en de **Server Members Intent** aan, anders start de bot niet.

## Welkomstbericht
Nieuwe leden krijgen een welkomstbericht met banner in het kanaal `welcomeChannelId` uit `src/config.js`.

## Verlengingsherinnering
Het gratis plan van Bot-Hosting moet elke 4 dagen verlengd worden. De bot stuurt 3 dagen na de laatste verlenging een DM naar de gebruiker(s) in `notifyIds`, en daarna elke 12 uur tot iemand op **✅ Ik heb verlengd** klikt.

## Omgevingsvariabelen
| Naam | Verplicht | Uitleg |
|---|---|---|
| `DISCORD_TOKEN` | ja | Token uit de Discord Developer Portal |
| `BOTHOSTING_API_KEY` | voor /restart | Key van https://bot-hosting.net/dash/developer met scope `deployments:power` (en `deployments:read` als je geen deployment-id invult) |
| `BOTHOSTING_DEPLOYMENT_ID` | nee | Id van de deployment (`dep_...`), nodig als je meerdere deployments hebt |

Zet deze **nooit** in de code of op GitHub.

## Starten
```
npm install
npm start
```

## Updates
Elke kleine wijziging aan de bot krijgt een nieuwe regel onderaan in `src/updates.js`, bijvoorbeeld `['Tickets', 'Wat er veranderd is.']`.
Bij elke start plaatst de bot nieuwe updates in het updatekanaal als klein embed ("(Categorie): tekst") met het account van Bas eronder.
