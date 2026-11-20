# Mathisse-discord--bot

Discord-bot (discord.js v14) gehost op Bot-Hosting.

## Commands
- `/restart` – herstart de bot. Alleen te gebruiken door de Discord-ID's in `ALLOWED_RESTART_IDS` in `index.js`.
- `/verlengen` – status van de verlenging bij Bot-Hosting, met knoppen (zelfde 2 gebruikers).

## Verlengingsherinnering
Het gratis plan van Bot-Hosting moet elke 4 dagen verlengd worden. De bot stuurt 3 dagen na de laatste verlenging een DM naar de beheerders, en daarna elke 12 uur tot iemand op **✅ Ik heb verlengd** klikt.

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
