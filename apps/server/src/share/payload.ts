import type { Element, SharePublicPayload } from '@stasis/shared';

// Witness-copy only: an inspiring, public-safe one-liner + blurb per lead
// element. This is NOT the belief matrix (content/matrix/flagship-cards.yaml)
// — it never mentions a wheel sphere, a score, or a weak area, so it is safe
// to serve from an unauthenticated route.
export const SHARE_COPY: Record<Element, { headline: string; blurb: string }> = {
  fire: {
    headline: 'Я — Огонь 🔥',
    blurb: 'Ты живёшь через энергию и движение вперёд: видишь цель раньше других и умеешь зажечь ею людей вокруг.',
  },
  water: {
    headline: 'Я — Вода 💧',
    blurb: 'Ты чувствуешь глубину там, где другие видят только поверхность: тонкая интуиция и умение быть рядом — твоя сила.',
  },
  air: {
    headline: 'Я — Воздух 🌬️',
    blurb: 'Ты живёшь идеями и связями: лёгкость мышления и любопытство помогают тебе видеть то, что не видят другие.',
  },
  earth: {
    headline: 'Я — Земля 🌳',
    blurb: 'Ты — та самая опора, на которую можно положиться: надёжность и спокойная устойчивость — твоя суперсила.',
  },
};

export function buildSharePayload(leadElement: Element): SharePublicPayload {
  const { headline, blurb } = SHARE_COPY[leadElement];
  return { leadElement, headline, blurb };
}
