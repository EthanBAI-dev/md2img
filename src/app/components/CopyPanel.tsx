import { useState } from 'react';
import { formatTags, type XhsCopy } from '../../core/ai';
import { PUBLISH_TARGETS, type PlatformId } from '../../shared/messages';
import { AddChip, EditableChip } from './EditableChip';
import { Icon } from './Icon';

interface Props {
  platform: PlatformId;
  copy: XhsCopy | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
  onCreateManual: () => void;
  onChange: (copy: XhsCopy) => void;
  /** 生成按钮上的补充说明，比如抖音版会写「按小红书文案改写」 */
  generateHint?: string;
  /** 只有在扩展里才有「一键填入」，网页版不传 */
  onPublish?: () => void;
  publishDisabled?: boolean;
}

/** 两个平台的叫法和写法不同，文案面板按平台换措辞 */
const WORDING: Record<PlatformId, { title: string; body: string; tags: string; bodyPlaceholder: string }> = {
  xiaohongshu: { title: '备选标题', body: '正文内容', tags: '话题标签', bodyPlaceholder: '正文开头两行要交代清楚这篇解决什么问题' },
  douyin: { title: '作品标题', body: '作品描述', tags: '话题', bodyPlaceholder: '第一句就是钩子，80~300 字，结尾引导收藏或关注' },
};

function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="link-btn"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={11} />
      {done ? '已复制' : label}
    </button>
  );
}

export function CopyPanel({
  platform,
  copy,
  loading,
  error,
  onGenerate,
  onCreateManual,
  onChange,
  generateHint,
  onPublish,
  publishDisabled,
}: Props) {
  const target = PUBLISH_TARGETS[platform];
  const words = WORDING[platform];
  const picked = copy ? Math.min(copy.selectedTitle ?? 0, Math.max(0, copy.titles.length - 1)) : 0;
  const allText = copy ? `${copy.titles[picked] ?? ''}\n\n${copy.body}\n\n${formatTags(copy.tags)}` : '';

  return (
    <section className={`panel copy-panel copy-panel--${platform}`}>
      <div className="copy-scroll">
        <header className="copy-head">
          <span className="copy-title">
            <Icon name="hash" size={13} className="copy-title-icon" />
            {target.name}文案
          </span>
          <button
            type="button"
            className="btn btn--soft btn--sm"
            onClick={onGenerate}
            disabled={loading}
            title={generateHint}
          >
            <Icon name={loading ? 'spinner' : 'sparkles'} size={12} className={loading ? 'spin' : 'brand-icon'} />
            {loading ? '生成中…' : copy ? 'AI 重新生成' : 'AI 生成'}
          </button>
        </header>
        {generateHint && !copy && <p className="hint">{generateHint}</p>}

        {error && <p className="alert alert--error">{error}</p>}

        {!copy && (
          <div className="copy-empty">
            {!error && <p className="hint">可以让 AI 根据笔记生成，也可以只填你需要的标题、正文或话题，内容会自动保存。</p>}
            <button type="button" className="btn btn--ghost btn--sm" onClick={onCreateManual}>
              <Icon name="pen" size={12} />
              手动填写文案
            </button>
          </div>
        )}

        {copy && (
          <>
            <div className="copy-field">
              <div className="copy-field-head">
                <span>
                  {words.title}
                  <span className="counter"> {(copy.titles[picked] ?? '').length}/{target.titleMax}</span>
                </span>
                <CopyButton text={copy.titles[picked] ?? ''} label="复制选中" />
              </div>
              <div className="chip-list chip-list--rows">
                {copy.titles.map((title, index) => (
                  <EditableChip
                    key={index}
                    row
                    value={title}
                    placeholder={`${words.title} ${index + 1}`}
                    maxLength={target.titleMax}
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
                    row
                    label="标题"
                    placeholder={`输入${target.name}${words.title}`}
                    maxLength={target.titleMax}
                    onAdd={(v) => onChange({ ...copy, titles: [...copy.titles, v], selectedTitle: copy.titles.length })}
                  />
                )}
              </div>
            </div>

            <div className="copy-field">
              <div className="copy-field-head">
                <span>
                  {words.body}
                  <span className="counter"> {copy.body.length}/{target.bodyMax} 字</span>
                </span>
                <CopyButton text={copy.body} label={`复制${words.body.slice(-2)}`} />
              </div>
              <textarea
                className="copy-textarea"
                value={copy.body}
                rows={7}
                placeholder={words.bodyPlaceholder}
                onChange={(e) => onChange({ ...copy, body: e.target.value.slice(0, target.bodyMax) })}
              />
            </div>

            <div className="copy-field">
              <div className="copy-field-head">
                <span>
                  {words.tags}
                  <span className="counter"> {copy.tags.length}/{target.tagMax} 个</span>
                </span>
                <CopyButton text={formatTags(copy.tags)} label={`复制${words.tags.slice(-2)}`} />
              </div>
              <div className="chip-list">
                {copy.tags.map((tag, index) => (
                  <EditableChip
                    key={`${tag}-${index}`}
                    value={tag}
                    prefix="# "
                    placeholder={words.tags}
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
                {copy.tags.length < target.tagMax && (
                  <AddChip
                    label="标签"
                    placeholder={`${words.tags}名，回车继续加`}
                    maxLength={20}
                    onAdd={(v) => {
                      const clean = v.replace(/^#+/, '').trim();
                      if (!clean || copy.tags.includes(clean)) return;
                      onChange({ ...copy, tags: [...copy.tags, clean] });
                    }}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 固定在标签页底部：看着哪份文案，就发哪个平台 */}
      <footer className="copy-foot">
        {onPublish ? (
          <button type="button" className="btn btn--dark btn--block" disabled={publishDisabled} onClick={onPublish}>
            <Icon name="send" size={13} />
            一键填入{target.name}
          </button>
        ) : null}
        <div className="copy-foot-row">
          <span className="hint">
            {onPublish
              ? copy
                ? '用上面这份文案，停在发布按钮前由你确认'
                : `还没写${target.name}文案，会只传图片`
              : '网页版不能自动填表，复制后手动粘贴'}
          </span>
          {copy && <CopyButton text={allText} label="复制全部" />}
        </div>
      </footer>
    </section>
  );
}
