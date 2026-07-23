import type { RenderedResult, SphereInsight } from '@stasis/shared';

export interface MiniInsightScreenProps {
  sphereInsight: SphereInsight;
  resourceState: RenderedResult['resourceState'];
  onDeepen: () => void;
  onShare: () => void;
}

const SAFETY_TEXT =
  'Если сейчас тяжело — вы можете обратиться за поддержкой к специалисту или на линию психологической помощи.';

export function MiniInsightScreen({
  sphereInsight,
  resourceState,
  onDeepen,
  onShare,
}: MiniInsightScreenProps) {
  return (
    <div className="screen mini-insight-screen">
      <h1 className="screen-title">Быстрый взгляд</h1>

      {resourceState === 'critical' ? (
        <div className="safety-block" role="note">
          <p>{SAFETY_TEXT}</p>
        </div>
      ) : null}

      <p className="screen-text">{sphereInsight.observation}</p>
      <p className="mini-insight-step">{sphereInsight.recommendation.action}</p>
      <p className="mini-insight-question">{sphereInsight.reflectiveQuestion}</p>

      <button type="button" className="btn-continue" onClick={onDeepen}>
        Понять, почему именно у меня → пройти тест
      </button>

      <button type="button" className="btn-share" onClick={onShare}>
        Поделиться
      </button>
    </div>
  );
}
