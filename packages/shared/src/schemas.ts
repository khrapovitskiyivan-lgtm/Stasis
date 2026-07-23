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
