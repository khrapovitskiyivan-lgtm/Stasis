import { z } from 'zod';

export const AREAS = ['health', 'family', 'rest', 'friends', 'career', 'hobby'] as const;
export const ELEMENTS = ['fire', 'water', 'air', 'earth'] as const;
export const STRATEGIES = ['power', 'attention', 'superiority', 'avoidance'] as const;
export type Area = (typeof AREAS)[number];
export type Element = (typeof ELEMENTS)[number];
export type Strategy = (typeof STRATEGIES)[number];

const score1to10 = z.number().int().min(1).max(10);
export const WheelScoresSchema = z.object(
  Object.fromEntries(AREAS.map((a) => [a, score1to10])) as Record<Area, typeof score1to10>
);
export type WheelScores = z.infer<typeof WheelScoresSchema>;

export const LikertAnswerSchema = z.object({
  itemId: z.string().min(1),
  value: z.number().int().min(1).max(6),
});
export type LikertAnswer = z.infer<typeof LikertAnswerSchema>;

export const SubmitPayloadSchema = z.object({
  wheel: WheelScoresSchema,
  elementAnswers: z.array(LikertAnswerSchema),
  strategyAnswers: z.array(LikertAnswerSchema),
  resourceAnswers: z.array(LikertAnswerSchema),
});
export type SubmitPayload = z.infer<typeof SubmitPayloadSchema>;

export const ConsentPayloadSchema = z.object({
  docVersion: z.string().min(1),
  pdn: z.literal(true),
  psych: z.literal(true),
  age18: z.literal(true),
});
export type ConsentPayload = z.infer<typeof ConsentPayloadSchema>;

export const RecommendationSchema = z.object({
  trigger: z.string().min(1),
  action: z.string().min(1),
  minThreshold: z.string().min(1),
  doneCriterion: z.string().min(1),
  delegateVariant: z.string().optional(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

const elementEnum = z.enum(ELEMENTS);
const areaEnum = z.enum(AREAS);
const strategyEnum = z.enum(STRATEGIES);

export const BeliefCardSchema = z.object({
  element: elementEnum, area: areaEnum,
  strengthFraming: z.string().min(1), belief: z.string().min(1), pattern: z.string().min(1),
  recommendation: RecommendationSchema, openQuestion: z.string().min(1),
});
export type BeliefCard = z.infer<typeof BeliefCardSchema>;

export const SphereInsightSchema = z.object({
  area: areaEnum, observation: z.string().min(1),
  recommendation: RecommendationSchema, reflectiveQuestion: z.string().min(1),
});
export type SphereInsight = z.infer<typeof SphereInsightSchema>;

export const StrategyProfileSchema = z.object({
  name: z.string().min(1), coreDrive: z.string().min(1), childhoodLogic: z.string().min(1),
  underStress: z.string().min(1), gift: z.string().min(1), cost: z.string().min(1), growthNudge: z.string().min(1),
});
export type StrategyProfile = z.infer<typeof StrategyProfileSchema>;

export const StrategyTestItemSchema = z.object({
  id: z.number().int(), loads: strategyEnum, key: z.enum(['direct', 'reverse']),
  situation: z.string().min(1), statement: z.string().min(1),
});
export type StrategyTestItem = z.infer<typeof StrategyTestItemSchema>;

export const ElementItemMetaSchema = z.object({
  id: z.string().min(1), loads: elementEnum, key: z.enum(['direct', 'reverse']),
});
export type ElementItemMeta = z.infer<typeof ElementItemMetaSchema>;

export const InteractionGuideSchema = z.object({
  you: strategyEnum, other: strategyEnum,
  collision: z.string().min(1), howTo: z.array(z.string().min(1)).min(1),
});
export type InteractionGuide = z.infer<typeof InteractionGuideSchema>;

export const RenderedResultSchema = z.object({
  leadElement: elementEnum, secondElement: elementEnum.nullable(),
  elementState: z.enum(['confident', 'mixed', 'none']),
  resourceState: z.enum(['ok', 'low', 'critical']),
  sphereInsight: SphereInsightSchema,
  beliefCards: z.array(BeliefCardSchema),
  strategy: z.object({
    state: z.enum(['confident', 'mixed', 'none']),
    lead: StrategyProfileSchema,
    second: StrategyProfileSchema.nullable(),
    guides: z.array(InteractionGuideSchema),
  }),
});
export type RenderedResult = z.infer<typeof RenderedResultSchema>;

// --- Return loop (check-in) contract ---

export const CheckinSubmitSchema = z.object({
  wheel: WheelScoresSchema,
  energy: z.number().int().min(1).max(6),
  stepRef: z.number().int().nullable(),
  stepOutcome: z.enum(['done', 'partial', 'missed', 'changed']).nullable(),
  note: z.string().max(500).nullable(),
});
export type CheckinSubmit = z.infer<typeof CheckinSubmitSchema>;

// Mirrors apps/server/src/engine/digest.ts `Digest` — the digest is computed
// server-side (deterministic selection engine) and shipped to the client as
// plain JSON; this schema lets the client validate the response shape.
export const ObservationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('step'), outcome: z.enum(['done', 'partial', 'missed', 'changed']) }),
  z.object({ kind: z.literal('sphere'), area: areaEnum, delta: z.number() }),
  z.object({ kind: z.literal('pattern'), area: areaEnum }),
  z.object({ kind: z.literal('energy'), delta: z.number() }),
]);
export type Observation = z.infer<typeof ObservationSchema>;

export const DigestSchema = z.object({
  observations: z.array(ObservationSchema),
  nextStep: z.enum(['continue', 'shrink', 'new']),
  safety: z.boolean(),
});
export type Digest = z.infer<typeof DigestSchema>;

// GET /checkin: a memory anchor — the last assigned step (if any) and the
// most recent wheel snapshot (from a check-in, else the onboarding test run).
export const CheckinPromptSchema = z.object({
  lastStep: z.object({ text: z.string(), cardRef: z.string() }).nullable(),
  lastWheel: WheelScoresSchema.nullable(),
});
export type CheckinPrompt = z.infer<typeof CheckinPromptSchema>;

// Public share payload: witness-copy only. Deliberately excludes scores,
// spheres, answers, and belief/matrix text — this is the only shape that
// ever reaches an unauthenticated /share/:slug response.
export const SharePublicPayloadSchema = z.object({
  leadElement: elementEnum,
  headline: z.string().min(1),
  blurb: z.string().min(1),
});
export type SharePublicPayload = z.infer<typeof SharePublicPayloadSchema>;
