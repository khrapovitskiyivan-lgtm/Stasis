import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';
import {
  AREAS, ELEMENTS, STRATEGIES,
  SphereInsightSchema, BeliefCardSchema, StrategyProfileSchema,
  StrategyTestItemSchema, InteractionGuideSchema, ElementItemMetaSchema,
  type Area, type Element, type Strategy,
  type SphereInsight, type BeliefCard, type StrategyProfile,
  type StrategyTestItem, type InteractionGuide, type ElementItemMeta,
} from '@stasis/shared';

export class ContentError extends Error {}

export interface ResourceItem { id: string; key: 'direct' | 'distress'; statement: string }
export interface ContentBundle {
  version: string;
  matrix: Record<Element, Partial<Record<Area, BeliefCard>>>;
  sphereInsights: Record<Area, SphereInsight>;
  strategies: Record<Strategy, StrategyProfile>;
  strategyTest: { items: StrategyTestItem[] };
  interactionGuides: InteractionGuide[];
  elementItems: (ElementItemMeta & { statement: string })[];
  resourceItems: ResourceItem[];
}

const read = (p: string) => yaml.load(readFileSync(p, 'utf8')) as any;

const FORBIDDEN_ROOTS = ['диагноз', 'диагностик', 'лечени', 'терапи', 'расстройств', 'гаранти', 'научно доказан'];
const FORBIDDEN = new RegExp(`(?:${FORBIDDEN_ROOTS.join('|')})`, 'iu');
// "увлечение/увлечённость" (hobby) contains "лечени" but is benign — strip such
// words before scanning. A blanket word-boundary rule would instead miss fused
// Russian compounds (психотерапия, самолечение, психодиагностика) that must be caught.
const BENIGN = /увлеч\p{L}*/giu;
const hasForbidden = (s: string): boolean => FORBIDDEN.test(s.replace(BENIGN, ''));

export function loadContent(rootDir: string): ContentBundle {
  const cm = resolve(rootDir, 'content/matrix');
  const ct = resolve(rootDir, 'content/tests');
  try {
    const strat = read(resolve(cm, 'strategies.yaml'));
    const insights = read(resolve(cm, 'sphere-insights.yaml'));
    const cards = read(resolve(cm, 'flagship-cards.yaml'));
    const els = read(resolve(ct, 'elements.yaml'));
    const res = read(resolve(ct, 'resource.yaml'));

    const sphereInsights = Object.fromEntries(
      AREAS.map((a) => [a, SphereInsightSchema.parse(insights.sphereInsights[a])])
    ) as Record<Area, SphereInsight>;

    const matrix = {} as Record<Element, Partial<Record<Area, BeliefCard>>>;
    for (const el of ELEMENTS) {
      matrix[el] = {};
      const byArea = cards.matrix?.[el] ?? {};
      for (const a of Object.keys(byArea)) matrix[el][a as Area] = BeliefCardSchema.parse(byArea[a]);
    }

    const strategies = Object.fromEntries(
      STRATEGIES.map((s) => [s, StrategyProfileSchema.parse(strat.strategies[s])])
    ) as Record<Strategy, StrategyProfile>;

    const strategyTest = { items: strat.strategyTest.items.map((i: unknown) => StrategyTestItemSchema.parse(i)) };
    const interactionGuides = strat.interactionGuides.map((g: unknown) => InteractionGuideSchema.parse(g));
    const elementItems = els.items.map((i: any) => ({ ...ElementItemMetaSchema.parse(i), statement: String(i.statement) }));
    const resourceItems: ResourceItem[] = res.items.map((i: any) => ({ id: i.id, key: i.key, statement: i.statement }));

    const bundle: ContentBundle = { version: '', matrix, sphereInsights, strategies, strategyTest, interactionGuides, elementItems, resourceItems };
    bundle.version = contentVersion(bundle);
    return bundle;
  } catch (e) {
    throw new ContentError(`content parse/validate failed: ${(e as Error).message}`);
  }
}

export function contentVersion(bundle: Omit<ContentBundle, 'version'> | ContentBundle): string {
  const { version: _omit, ...rest } = bundle as ContentBundle;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 12);
}

export function validateContent(b: ContentBundle): void {
  const fail = (m: string) => { throw new ContentError(m); };
  for (const a of AREAS) if (!b.sphereInsights[a]) fail(`missing sphereInsight ${a}`);
  if (b.strategyTest.items.length !== 16) fail('strategyTest must have 16 items');
  const pairs = new Set(b.interactionGuides.map((g) => `${g.you}:${g.other}`));
  if (pairs.size !== 16) fail(`interactionGuides must cover 16 directed pairs, got ${pairs.size}`);
  for (const s of STRATEGIES) if (!b.strategies[s]) fail(`missing strategy profile ${s}`);
  const byEl = (el: Element) => b.elementItems.filter((i) => i.loads === el).length;
  for (const el of ELEMENTS) if (byEl(el) !== 6) fail(`element ${el} must have 6 items, got ${byEl(el)}`);
  // forbidden lexicon across all human-facing strings
  const strings: string[] = [];
  const walk = (v: any) => { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk({ si: b.sphereInsights, mx: b.matrix, st: b.strategies, ig: b.interactionGuides,
         stt: b.strategyTest, ei: b.elementItems, ri: b.resourceItems });
  for (const s of strings) if (hasForbidden(s)) fail(`forbidden lexicon in content: "${s.slice(0, 40)}…"`);
}
