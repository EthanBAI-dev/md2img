import { useState } from 'react';
import { formatTags, type XhsCopy } from '../../core/ai';

interface Props {
  copy: XhsCopy | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
  onCreateManual: () => void;
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

export function CopyPanel({ copy, loading, error, onGenerate, onCreateManual, onChange }: Props) {
  const [tagDraft, setTagDraft] = useState('');
  const picked = copy ? Math.min(copy.selectedTitle ?? 0, Math.max(0, copy.titles.length - 1)) : 0;

  const addTag = () => {
    if (!copy) return;
    const tag = tagDraft.replace(/^#+/, '').trim();
    if (!tag || copy.tags.includes(tag) || copy.tags.length >= 10) return;
    onChange({ ...copy, tags: [...copy.tags, tag] });
    setTagDraft('');
  };

  return (
    <section className="panel">
      <header className="panel-head">
        <h3>小红书文案</h3>
        <button type="button" className="btn btn--primary btn--sm" onClick={onGenerate} disabled={loading}>
          {loading ? '生成中…' : copy ? 'AI 重新生成' : 'AI 生成'}
        </button>
      </header>

      {error && <p className="alert alert--error">{error}</p>}

      {!copy && (
        <div className="copy-empty">
          {!error && <p className="hint">可让 AI 根据笔记生成，也可以只填写你需要的标题、正文或标签，内容会自动保存。</p>}
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCreateManual}>手动填写文案</button>
        </div>
      )}

      {copy && (
        <div className="copy-body">
          <div className="field">
            <label>
              标题 <span className="counter">{(copy.titles[picked] ?? '').length}/20</span>
            </label>
            <div className="title-options">
              {copy.titles.map((title, index) => (
                <button
                  key={index}
                  type="button"
                  className={`title-chip${index === picked ? ' is-active' : ''}`}
                  onClick={() => onChange({ ...copy, selectedTitle: index })}
                >
                  {title || `标题 ${index + 1}`}
                </button>
              ))}
              {copy.titles.length < 5 && (
                <button
                  type="button"
                  className="title-chip"
                  onClick={() => onChange({ ...copy, titles: [...copy.titles, ''], selectedTitle: copy.titles.length })}
                >
                  ＋ 添加标题
                </button>
              )}
            </div>
            <div className="editable-title-row">
              <input
                aria-label="编辑当前标题"
                value={copy.titles[picked] ?? ''}
                maxLength={20}
                placeholder="输入小红书标题"
                onChange={(e) => {
                  const titles = [...copy.titles];
                  titles[picked] = e.target.value;
                  onChange({ ...copy, titles });
                }}
              />
              {copy.titles.length > 1 && (
                <button
                  type="button"
                  className="btn btn--ghost btn--xs"
                  onClick={() => {
                    const titles = copy.titles.filter((_, index) => index !== picked);
                    onChange({ ...copy, titles, selectedTitle: Math.max(0, picked - 1) });
                  }}
                >
                  删除
                </button>
              )}
              <CopyButton text={copy.titles[picked] ?? ''} label="复制" />
            </div>
          </div>

          <div className="field">
            <label>
              正文 <span className="counter">{copy.body.length}/1000</span>
            </label>
            <textarea
              value={copy.body}
              rows={8}
              placeholder="可单独填写正文；不需要时留空即可"
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
              {copy.tags.map((tag, index) => (
                <span key={`${tag}-${index}`} className="tag">
                  #{tag}
                  <button
                    type="button"
                    aria-label={`删除标签 ${tag}`}
                    onClick={() => onChange({ ...copy, tags: copy.tags.filter((_, i) => i !== index) })}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="tag-entry-row">
              <input
                value={tagDraft}
                placeholder="添加标签，回车确认"
                disabled={copy.tags.length >= 10}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <button type="button" className="btn btn--ghost btn--xs" disabled={!tagDraft.trim() || copy.tags.length >= 10} onClick={addTag}>添加</button>
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
