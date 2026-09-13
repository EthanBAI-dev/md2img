import { TONES, type ToneId } from '../../core/ai';
import { Icon } from './Icon';

interface Props {
  tone: ToneId;
  onSelect: (tone: ToneId) => void;
}

/**
 * 「去 AI 味」的文风档位。这一档同时决定两件事：
 * 「AI 去味」按什么腔调改写正文，以及「AI 生成」写出什么腔调的小红书文案——
 * 一处选择两处生效，免得图上的文章和配套文案对不上。
 */
export function TonePicker({ tone, onSelect }: Props) {
  return (
    <div className="tone-row">
      <span className="tone-label">
        <Icon name="sparkles" size={13} />
        AI 文风
      </span>
      <div className="tone-group" role="radiogroup" aria-label="AI 文风">
        {TONES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={tone === t.id}
            className={`tone-btn${tone === t.id ? ' is-active' : ''}`}
            title={t.hint}
            onClick={() => onSelect(t.id)}
          >
            {t.label.replace(/^[①②③]\s*/, '')}
          </button>
        ))}
      </div>
    </div>
  );
}
