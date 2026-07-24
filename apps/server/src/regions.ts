// Region is a config axis, not a code fork: everything region-specific (data
// residency claims, crisis-support copy, legal doc links) lives here so a
// future global deploy is a redeploy (set REGION=eu) rather than a rewrite.
export const REGIONS = {
  ru: {
    dataResidency: 'Russia (RU)',
    // Official, government-operated line — verified against the МЧС source
    // (psi.mchs.gov.ru): all-Russia, 24/7, free, anonymous, for adults. Chosen
    // over NGO hotlines (which can quietly go defunct) so the number stays valid.
    // 112 added for immediate danger to life. Re-verify before the full pilot.
    crisisSupport:
      'Если сейчас тяжело, вы можете бесплатно и анонимно обратиться за поддержкой: круглосуточная линия экстренной психологической помощи МЧС России — +7 (495) 989-50-50. Если есть угроза жизни, звоните 112.',
  },
  eu: {
    dataResidency: 'European Union (EU)',
    // Stub: EU launch is not scoped yet; English placeholder copy only.
    crisisSupport:
      'If things feel hard right now, support is available. TODO: add the correct EU/local crisis-support line before launch.',
  },
} as const;

export type Region = keyof typeof REGIONS;

export function regionConfig(region: string): (typeof REGIONS)[Region] {
  if (!(region in REGIONS)) throw new Error('unknown region: ' + region);
  return REGIONS[region as Region];
}
