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
  name: z.string(), coreDrive: z.string(), childhoodLogic: z.string(),
  underStress: z.string(), gift: z.string(), cost: z.string(), growthNudge: z.string(),
});
export type StrategyProfile = z.infer<typeof StrategyProfileSchema>;

export const StrategyTestItemSchema = z.object({
  id: z.number().int(), loads: strategyEnum, key: z.enum(['direct', 'reverse']),
  situation: z.string(), statement: z.string(),
});
export type StrategyTestItem = z.infer<typeof StrategyTestItemSchema>;

export const ElementItemMetaSchema = z.object({
  id: z.string().min(1), loads: elementEnum, key: z.enum(['direct', 'reverse']),
});
export type ElementItemMeta = z.infer<typeof ElementItemMetaSchema>;

export const InteractionGuideSchema = z.object({
  you: strategyEnum, other: strategyEnum,
  collision: z.string(), howTo: z.array(z.string().min(1)).min(1),
});
export type InteractionGuide = z.infer<typeof InteractionGuideSchema>;
