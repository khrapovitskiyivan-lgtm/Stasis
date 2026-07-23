import type { RenderedResult } from '@stasis/shared';
import type { ContentBundle } from '../content/loader.js';
import type { computeProfile } from './index.js';

type Profile = ReturnType<typeof computeProfile>;

export function renderResult(p: Profile, content: ContentBundle): RenderedResult {
  const beliefCards = p.beliefCardIds
    .map((ref) => content.matrix[ref.element]?.[ref.area])
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const guides = p.guideRefs
    .map((g) => content.interactionGuides.find((x) => x.you === g.you && x.other === g.other))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  return {
    leadElement: p.leadElement,
    secondElement: p.secondElement ?? null,
    isMixed: p.isMixed,
    resourceState: p.resourceState,
    // p.weakArea is never undefined: computeProfile guards the empty-weakAreas
    // case (all spheres > 4) by falling back to the lowest sphere, mirroring
    // computeMiniInsight's lowestArea fallback.
    sphereInsight: content.sphereInsights[p.weakArea],
    beliefCards,
    strategy: { lead: content.strategies[p.leadStrategy], guides },
  };
}
