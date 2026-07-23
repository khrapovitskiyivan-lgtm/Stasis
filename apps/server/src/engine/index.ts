import { STRATEGIES, type Area, type Strategy, type LikertAnswer, type WheelScores } from '@stasis/shared';
import type { ContentBundle, ResourceItem } from '../content/loader.js';
import { scoreElements, scoreStrategies, scoreResource, weakAreas } from './scoring.js';

export function computeMiniInsight(wheel: WheelScores, resourceAnswers: LikertAnswer[], content: ContentBundle) {
  const weak = weakAreas(wheel);
  const weakArea = weak[0] ?? lowestArea(wheel);
  const imbalanceGap = Math.max(...areaVals(wheel)) - Math.min(...areaVals(wheel));
  const { state } = scoreResource(resourceAnswers, content.resourceItems);
  return { weakArea, imbalanceGap, resourceState: state, sphereInsightId: weakArea };
}

export function computeProfile(
  elementAnswers: LikertAnswer[], strategyAnswers: LikertAnswer[],
  wheel: WheelScores, resourceAnswers: LikertAnswer[], content: ContentBundle,
) {
  const el = scoreElements(elementAnswers, content.elementItems);
  const st = scoreStrategies(strategyAnswers, content.strategyTest.items);
  const { state } = scoreResource(resourceAnswers, content.resourceItems);
  const weak = weakAreas(wheel);
  const beliefCardIds = weak
    .filter((a) => content.matrix[el.lead]?.[a])
    .map((a) => ({ element: el.lead, area: a }))
    .slice(0, 3);
  const guideRefs = STRATEGIES.map((other) => ({ you: st.lead, other }));
  return {
    leadElement: el.lead, secondElement: el.second, isMixed: el.isMixed,
    weakAreas: weak, resourceState: state, beliefCardIds,
    leadStrategy: st.lead, secondStrategy: st.second, isStrategyMixed: st.isMixed, guideRefs,
  };
}

const areaVals = (w: WheelScores) => Object.values(w);
const lowestArea = (w: WheelScores): Area =>
  (Object.entries(w).sort((a, b) => a[1] - b[1])[0][0]) as Area;
