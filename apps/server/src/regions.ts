// Region is a config axis, not a code fork: everything region-specific (data
// residency claims, crisis-support copy, legal doc links) lives here so a
// future global deploy is a redeploy (set REGION=eu) rather than a rewrite.
export const REGIONS = {
  ru: {
    dataResidency: 'Russia (RU)',
    // TODO: confirm the exact all-Russia psychological-help line before
    // shipping this copy to real users — placeholder-but-plausible for now.
    crisisSupport:
      'Если сейчас тяжело, вы можете обратиться за поддержкой: единый общероссийский телефон доверия психологической помощи 8-800-2000-122 (круглосуточно, бесплатно).',
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
