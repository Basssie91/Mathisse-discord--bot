// ============================================================
//  INSTELLINGEN TICKETSYSTEEM
// ============================================================

module.exports = {
  // ---- Kanalen en rollen (rechtermuisknop → ID kopiëren, met Ontwikkelaarsmodus aan) ----
  panelChannelId: '1516461284374216774', // kanaal waar het ticketpaneel staat
  welcomeChannelId: '1516133257014546713', // welkomstberichten
  rulesChannelId: '1516133257014546714', // regelskanaal: hier staat de regels-embed
  joinRoleId: '1516464931191525478',     // rol die nieuwe leden krijgen bij joinen
  staffRoleId: '1516133255869497481',   // ziet Vragen-tickets
  bestuurRoleId: '1516133255907115180', // ziet Vragen- en Bestuur-tickets
  // Wie één van deze rollen heeft, krijgt automatisch de staffrol (en verliest hem als hij er geen meer heeft)
  staffTriggerRoleIds: [
    '1516133255898730515',
    '1516133255907115180',
    '1516133255898730509',
    '1516133255898730508',
    '1516133255898730507',
    '1516133255898730506',
    '1516133255869497482',
  ],
  transcriptChannelId: '1516133259434528809', // gesloten tickets met transcript
  partnerChannelId: '1571121191614283919', // (optioneel) geaccepteerde partners
  partnerRequestChannelId: '1573456737401311302', // nieuwe partneraanvragen (afhandelen: adminIds)
  applicationChannelId: '1573457687113637978', // nieuwe staff-sollicitaties (afhandelen: adminIds)
  partnerRoleId: '1516770982948245671', // rol die geaccepteerde partners krijgen

  // Eigenaar: krijgt staff-sollicitaties en partneraanvragen in zijn DM en handelt ze af
  ownerId: '1506618917324460114',

  // Beheerders: mogen /changelog gebruiken en sollicitaties/partneraanvragen afhandelen
  adminIds: ['1057307298894196756', '1506618917324460114'],

  // Ziet en kan alles in elk ticket (ook Bestuur-tickets), los van rollen
  superUserIds: ['1057307298894196756'],

  // /opruimen: deze rollen en personen mogen berichten verwijderen
  purgeRoleIds: ['1516133255898730509'],
  purgeUserIds: ['1057307298894196756', '1506618917324460114'],

  // /giveaway: kanaal en wie een giveaway mag starten (plus adminIds)
  giveawayChannelId: '1523674964404998294',
  giveawayRoleIds: ['1516133255898730509'],

  // Woordketting
  wordChainChannelId: '1573464580741533706',

  // Tellen (met de vorige bot waren ze bij 134, dus het volgende getal is 135)
  countingChannelId: '1524408810654138378',
  countingStartAt: 134,

  // Botstatus (online / herstarten / offline)
  statusChannelId: '1573465938135621694',

  // Contentmeldingen (YouTube, Twitch, Kick), beheren met /content
  contentChannelId: '1516133257933226090',

  // /staff-update: kanaal en wie het mag gebruiken (plus adminIds)
  staffUpdateChannelId: '1573382523323420712',
  staffUpdateRoleIds: [],

  // Staff-overzicht van alle commands en wie ze mag gebruiken
  staffOverviewChannelId: '1516133258503655629',

  // Suggesties
  suggestionChannelId: '1516133258088288352',

  // Rollenpaneel (meldingsrollen kiezen)
  selfRolesChannelId: '1516133257014546715',

  // Promotie van andere servers (zie src/promo.js voor de servers)
  promoChannelId: '1516133257597419675',

  color: '#F0C14B', // goud, past bij het logo
  categoryName: '🎫 TICKETS',

  // Na een afwijzing pas na zoveel dagen opnieuw solliciteren
  cooldownDays: 7,

  // Keuzes in het ticketmenu.
  // team: welke rollen het ticket kunnen zien ('staff' = staffRoleId, 'bestuur' = bestuurRoleId)
  types: [
  // categoryId: categorie waar de tickets van deze soort in komen
    { id: 'vragen', label: 'Vragen', emoji: '❓', description: 'Heb je een vraag? Wij helpen je graag.', team: ['staff', 'bestuur'], categoryId: '1543971187560808570' },
    { id: 'bestuur', label: 'Bestuur', emoji: '👑', description: 'Zaken die alleen voor het bestuur zijn.', team: ['bestuur'], categoryId: '1545140372995309568' },
    {
      id: 'thumbnail', label: 'Thumbnail', emoji: '🖼️', description: 'Een thumbnail laten maken? Vul het formulier in.',
      team: ['staff'], categoryId: '1573733796098998443',
      // Eigen vragen in het formulier (de eerste is het onderwerp)
      fields: [
        { id: 'kanaal', label: 'Wat is je YouTube-kanaal?', style: 'short', required: true, placeholder: 'Bijv. youtube.com/@naam' },
        { id: 'opstaan', label: 'Wat moet er op de thumbnail staan?', style: 'long', required: true, placeholder: 'Tekst, personen, kleuren, sfeer...' },
        { id: 'wereld', label: 'Ben je crimi of bovenwereld?', style: 'short', required: false, placeholder: 'Crimi / Bovenwereld' },
        { id: 'extra', label: 'Extra info of voorbeelden?', style: 'long', required: false, placeholder: 'Links naar voorbeelden, deadline, ...' },
      ],
    },
    { id: 'staff', label: 'Staff sollicitatie', emoji: '🛡️', description: 'Solliciteren voor staff? Vul het formulier in.' },
    { id: 'partner', label: 'Partner aanvraag', emoji: '🤝', description: 'Partner worden met jouw server? Vul het formulier in.' },
  ],

  // Vragen van het sollicitatieformulier (max. 5)
  questions: [
    { id: 'waarom', label: 'Waarom wil je staff worden?', style: 'long', required: true },
    { id: 'ervaring', label: 'Ervaring als moderator/staff? Waar?', style: 'long', required: true },
    { id: 'uren', label: 'Hoeveel uur per week ben je actief?', style: 'short', required: true },
    { id: 'situatie', label: 'Wat doe je als iemand blijft schelden?', style: 'long', required: true },
    { id: 'extra', label: 'Wil je nog iets toevoegen?', style: 'long', required: false },
  ],
};
