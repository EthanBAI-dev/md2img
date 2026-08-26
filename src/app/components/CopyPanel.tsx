import { useState } from 'react';
import { formatTags, type XhsCopy } from '../../core/ai';

interface Props {
  copy: XhsCopy | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
  onChange: (copy: XhsCopy) => void;
}

function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--ghost btn--xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? '已复制' : label}
    </button>
  );
}

export function CopyPanel({ copy, loading, error, onGenerate, onChange }: Props) {
  const [picked, setPicked] = useState(0);

  return (
    <section className="panel">
      <header className="panel-head">
        <h3>小红书文案</h3>
        <button type="button" className="btn btn--primary btn--sm" onClick={onGenerate} disabled={loading}>
          {loading ? '生成中…' : copy ? '重新生成' : 'AI 生成'}
        </button>
      </header>

      {error && <p className="alert alert--error">{error}</p>}

      {!copy && !error && (
        <p className="hint">
          根据笔记正文生成标题、正文和话题标签。首次使用需要在设置里填一个 OpenAI 兼容接口的 Key。
        </p>
      )}

      {copy && (
        <div className="copy-body">
          <div className="field">
            <label>
              标题 <span className="counter">{(copy.titles[picked] ?? '').length}/20</span>
            </label>
            <div className="title-options">
              {copy.titles.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  className={`title-chip${i === picked ? ' is-active' : ''}`}
                  onClick={() => setPicked(i)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="field-actions">
              <CopyButton text={copy.titles[picked] ?? ''} label="复制标题" />
            </div>
          </div>

          <div className="field">
            <label>
              正文 <span className="counter">{copy.body.length}/1000</span>
            </label>
            <textarea
              value={copy.body}
              rows={8}
              onChange={(e) => onChange({ ...copy, body: e.target.value.slice(0, 1000) })}
            />
            <div className="field-actions">
              <CopyButton text={copy.body} label="复制正文" />
            </div>
          </div>

          <div className="field">
            <label>
              标签 <span className="counter">{copy.tags.length}/10</span>
            </label>
            <div className="tag-list">
              {copy.tags.map((t, i) => (
                <span key={i} className="tag">
                  #{t}
                  <button
                    type="button"
                    aria-label={`删除标签 ${t}`}
                    onClick={() => onChange({ ...copy, tags: copy.tags.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="field-actions">
              <CopyButton text={formatTags(copy.tags)} label="复制标签" />
              <CopyButton
                text={`${copy.titles[picked] ?? ''}\n\n${copy.body}\n\n${formatTags(copy.tags)}`}
                label="复制全部"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
