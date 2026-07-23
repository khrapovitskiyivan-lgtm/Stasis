// Region is a config axis, not a code fork: everything region-specific (data
// residency claims, crisis-support copy, legal doc links) lives here so a
// future global deploy is a redeploy (set REGION=eu) rather than a rewrite.
export const REGIONS = {
  ru: {
    dataResidency: 'Russia (RU)',
    // NO real phone number here on purpose: a real-but-wrong-scope line could
    // route an adult in crisis to the wrong service. Confirm the correct adult
    // crisis line with a professional and replace the placeholder BEFORE launch
    // (tracked as a pre-launch checklist item, not just this comment).
    crisisSupport:
      'Если сейчас тяжело, вы можете обратиться за поддержкой к специалисту или на линию психологической помощи. [TODO до запуска: подставить подтверждённый телефон доверия для взрослых.]',
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
