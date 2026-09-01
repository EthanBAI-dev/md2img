import { useState } from 'react';
import { formatTags, type XhsCopy } from '../../core/ai';
import { AddChip, EditableChip } from './EditableChip';

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
  const picked = copy ? Math.min(copy.selectedTitle ?? 0, Math.max(0, copy.titles.length - 1)) : 0;

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
            <div className="chip-list">
              {copy.titles.map((title, index) => (
                <EditableChip
                  key={index}
                  value={title}
                  placeholder={`标题 ${index + 1}`}
                  maxLength={20}
                  active={index === picked}
                  onSelect={() => onChange({ ...copy, selectedTitle: index })}
                  onChange={(next) => {
                    const titles = [...copy.titles];
                    titles[index] = next;
                    onChange({ ...copy, titles, selectedTitle: index });
                  }}
                  onRemove={
                    copy.titles.length > 1
                      ? () =>
                          onChange({
                            ...copy,
                            titles: copy.titles.filter((_, i) => i !== index),
                            selectedTitle: Math.max(0, picked - (index <= picked ? 1 : 0)),
                          })
                      : undefined
                  }
                />
              ))}
              {copy.titles.length < 5 && (
                <AddChip
                  label="标题"
                  placeholder="输入小红书标题"
                  maxLength={20}
                  onAdd={(v) => onChange({ ...copy, titles: [...copy.titles, v], selectedTitle: copy.titles.length })}
                />
              )}
            </div>
            <div className="field-actions">
              <CopyButton text={copy.titles[picked] ?? ''} label="复制选中标题" />
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
            <div className="chip-list">
              {copy.tags.map((tag, index) => (
                <EditableChip
                  key={`${tag}-${index}`}
                  value={tag}
                  prefix="#"
                  placeholder="标签"
                  maxLength={20}
                  onChange={(next) => {
                    const clean = next.replace(/^#+/, '').trim();
                    const tags = [...copy.tags];
                    if (!clean) tags.splice(index, 1);
                    else tags[index] = clean;
                    onChange({ ...copy, tags });
                  }}
                  onRemove={() => onChange({ ...copy, tags: copy.tags.filter((_, i) => i !== index) })}
                />
              ))}
              {copy.tags.length < 10 && (
                <AddChip
                  label="标签"
                  placeholder="标签名，回车继续加"
                  maxLength={20}
                  onAdd={(v) => {
                    const clean = v.replace(/^#+/, '').trim();
                    if (!clean || copy.tags.includes(clean)) return;
                    onChange({ ...copy, tags: [...copy.tags, clean] });
                  }}
                />
              )}
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
