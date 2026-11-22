# Mathisse-discord--bot

Discord-bot (discord.js v14) gehost op Bot-Hosting.

## Commands
- `/verjaardag` – voor iedereen, één keer: formulier met dag, maand en optioneel geboortejaar. `/resetverjaardag @lid` – staff wist iemands verjaardag. Felicitaties in `birthdayChannelId` (vanaf 09:00, of meteen als je hem op de dag zelf invult) en de rol 🎂 Jarig voor die dag (maakt de bot zelf aan).
- `/onderhoud` – onderhoud aan/uit (toggle). Leden kunnen de bot dan niet gebruiken, woordketting en tellen gaan op slot, status 🟠. Alleen `adminIds`.
- `/commands` – voor iedereen: overzicht van de commands en functies voor leden (team- en beheercommands staan er niet in).
- `/restart` – herstart de bot. Alleen te gebruiken door de Discord-ID's in `ALLOWED_RESTART_IDS` in `index.js`.
- `/verlengen` – status van de verlenging bij Bot-Hosting, met knoppen (voor de gebruikers in `allowedIds` in `index.js`).

- `/opruimen` – berichten verwijderen (1-100, optioneel van één persoon). Voor `purgeRoleIds` en `purgeUserIds` in `src/config.js`.
- `/giveaway` – opent een formulier (prijs, aantal winnaars 1-10, duur 1 uur t/m 4 weken, uitleg) en start de giveaway in `giveawayChannelId`. Voor `adminIds` en `giveawayRoleIds`.
- `/content` – formulier om een YouTuber of streamer toe te voegen (link; meldingen taggen altijd de rol 📡 Content). `/content-lijst` – overzicht en verwijderen. Alleen `adminIds`.
- `/staff-update` – formulier (persoon, Aangenomen/Ontslagen/Promotie/Degraderen, rol, reden) → bericht in `staffUpdateChannelId`. Voor `adminIds` en `staffUpdateRoleIds`.
- `/changelog` – changelog bekijken, regels toevoegen en publiceren (alleen beheerders uit `src/config.js`).

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
Nieuwe leden krijgen de rol `joinRoleId` en een welkomstbericht met banner in het kanaal `welcomeChannelId` uit `src/config.js`.

## Regels
De regels staan in `src/rules.js` en worden in `rulesChannelId` geplaatst. Bij elke start en na verwijderen zet de bot ze terug.

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

## Changelog
Elke wijziging aan de bot krijgt een regel in `src/updates.js` (met een vaste, unieke id).
Met `/changelog` zie je een voorbeeld van alles wat nog niet geplaatst is, kun je zelf regels toevoegen (➕) en publiceer je de update (✅) in het changelogkanaal, met versienummer, kopjes en banner. Na publiceren blijft de versie open: 🔁 Opnieuw publiceren vervangt het bericht. Pas met 🆕 afronden gaat de lijst leeg en begint de volgende versie.

## Woordketting
In `wordChainChannelId`: elk woord begint met de laatste letter van het vorige, alleen Nederlandse woorden (OpenTaal-lijst, wordt bij de eerste start gedownload naar `data/`), geen dubbele woorden en niet twee keer achter elkaar. Berichten van terwijl de bot offline was worden na het opstarten alsnog verwerkt.

## Tellen
In `countingChannelId`: steeds het volgende getal, niet twee keer achter elkaar, fout = opnieuw bij 1. Begint bij `countingStartAt` + 1 (135). Gemiste berichten worden na een herstart alsnog verwerkt.

## Botstatus
In `statusChannelId` staat één bericht dat de bot zelf bijwerkt: 🟢 online (met ping en "laatst gecontroleerd", elke minuut), 🔄 herstarten (via /restart) en 🔴 offline (bij netjes stoppen of een crash). Stond de bot uit zonder netjes af te sluiten, dan komt er bij de volgende start een ⚠️ storing in de geschiedenis.

## Contentmeldingen
Zoals Pingcord: elke 3 minuten controleert de bot de kanalen uit `/content`. YouTube via de openbare RSS-feed (nieuwe video's), Twitch via decapi.me en Kick via de openbare kick.com-API (live gaan). Elke melding tagt de meldingsrol 📡 Content uit het rollenpaneel.

## Staff-overzicht
In `staffOverviewChannelId` staat een embed met alle commands en wie ze mag gebruiken. Wordt bij elke start opnieuw opgebouwd uit de geregistreerde commands (zet bij een nieuw command de rechten in `ACCESS` in `src/staffOverview.js`) en teruggezet als het weg is.

## Automatische staffrol
Heeft iemand één van de rollen in `staffTriggerRoleIds`, dan krijgt hij `staffRoleId`; heeft hij er geen meer, dan gaat de staffrol weg. Bij elke start wordt iedereen gecontroleerd.

## Suggesties
In `suggestionChannelId`: paneel met knop **💡 Suggestie indienen** (staat altijd onderaan, komt terug als het weg is). Iedereen stemt met 👍/👎, elke suggestie krijgt een draadje, alleen de beheerders (`adminIds`) keuren goed of af. Leden kunnen in het kanaal zelf niet typen, wel in de draadjes.

## Rollenpaneel
In `selfRolesChannelId`: knoppen voor de meldingsrollen 📋 Changelog, 📡 Content en 📢 Mededelingen (aan/uit). De bot maakt de rollen zelf aan zonder rechten (rolicoontje vanaf boostlevel 2, de emoji staat ook in de naam). Paneel en rollen worden bij elke start gecontroleerd en teruggezet.

Bij het publiceren van een changelog wordt de rol 📋 Changelog getagd. 📢 Mededelingen tag je zelf.

## Promotie
In `promoChannelId` staat per server (lijst in `src/promo.js`) een embed met naam, icoon, ledenaantal en een Join-knop. Wordt bij elke start en elke 6 uur bijgewerkt en teruggezet als hij weg is.
