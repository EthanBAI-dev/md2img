import { useState } from 'react';
import { AI_PRESETS, usage, type AiConfig } from '../../core/ai';
import { Icon } from './Icon';

interface Props {
  config: AiConfig;
  defaultAuthor: string;
  onSave: (config: AiConfig, defaultAuthor: string) => void;
  onClose: () => void;
}

/** 字符数按人话显示，免得盯着一串数字数位数 */
function formatChars(n: number): string {
  if (n < 1000) return `${n} 字符`;
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)} 千字符`;
}

export function SettingsDialog({ config, defaultAuthor, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<AiConfig>(config);
  const [author, setAuthor] = useState(defaultAuthor);

  const applyPreset = (label: string) => {
    const preset = AI_PRESETS.find((p) => p.label === label);
    if (preset) setDraft({ ...draft, baseUrl: preset.baseUrl, model: preset.model });
  };

  const activePreset = AI_PRESETS.find((p) => p.baseUrl === draft.baseUrl);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="设置" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <span className="modal-title">
            <Icon name="gear" size={14} className="brand-icon" />
            设置 · AI 服务商配置
          </span>
          <button type="button" className="icon-btn" aria-label="关闭" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </header>

        <div className="modal-body">
          <div className="field">
            <label>默认署名</label>
            <input value={author} placeholder="不写就不显示署名" onChange={(e) => setAuthor(e.target.value)} />
            <p className="hint">笔记里没写 author 时，每页页脚用这个兜底。</p>
          </div>

          <div className="field">
            <label>AI 服务商</label>
            <div className="provider-grid">
              {AI_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`provider-btn${p.baseUrl === draft.baseUrl ? ' is-active' : ''}`}
                  onClick={() => applyPreset(p.label)}
                >
                  {p.label.replace('月之暗面 ', '')}
                </button>
              ))}
            </div>
          </div>

          <div className="field-grid">
            <div className="field">
              <label>API 地址</label>
              <input
                className="mono"
                value={draft.baseUrl}
                placeholder="https://api.deepseek.com/v1"
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              />
            </div>
            <div className="field">
              <label>模型</label>
              <input
                className="mono"
                value={draft.model}
                placeholder="deepseek-chat"
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label>API Key</label>
            <input
              className="mono"
              type="password"
              value={draft.apiKey}
              placeholder="sk-..."
              autoComplete="off"
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
            />
            <p className="hint">
              只存在本机浏览器里，不会上传到任何地方。
              {activePreset && (
                <>
                  {' '}
                  <a href={activePreset.keyUrl} target="_blank" rel="noreferrer">
                    去 {activePreset.label} 申请 Key →
                  </a>
                </>
              )}
            </p>
          </div>

          {/* 本次会话的实际消耗。放出来是为了让「省 token」这件事看得见——
              知道全文改写要发多少字，才会想起先选中一段再点 */}
          <div className="usage-box">
            <div className="usage-head">
              <span>本次会话用量</span>
              {usage.saved > 0 && (
                <span className="usage-saved">
                  <Icon name="leaf" size={11} />
                  重复请求省下 {formatChars(usage.saved)}
                </span>
              )}
            </div>
            <div className="usage-row">
              <span>
                已发送 <strong>{formatChars(usage.chars)}</strong>
              </span>
              <span>
                请求 <strong>{usage.calls} 次</strong>
              </span>
            </div>
            <p className="hint">
              省 token：在编辑框里<b>选中一段</b>再点「AI 排版 / AI 去味」，就只发这一段；只要封面就点「AI 封面」，只发正文开头。
            </p>
          </div>
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn--dark btn--sm"
            onClick={() => {
              onSave(draft, author.trim());
              onClose();
            }}
          >
            保存配置
          </button>
        </footer>
      </div>
    </div>
  );
}
