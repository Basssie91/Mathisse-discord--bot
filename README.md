# Mathisse-discord--bot

Discord-bot (discord.js v14) gehost op Bot-Hosting.

## Commands
- `/restart` – herstart de bot. Alleen te gebruiken door de Discord-ID's in `ALLOWED_RESTART_IDS` in `index.js`.

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
