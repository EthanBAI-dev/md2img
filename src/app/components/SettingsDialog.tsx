import { useState } from 'react';
import { AI_PRESETS, usage, type AiConfig } from '../../core/ai';

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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="panel-head">
          <h3>设置</h3>
          <button type="button" className="btn btn--ghost btn--xs" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="field">
          <label>默认署名</label>
          <input
            value={author}
            placeholder="不写就不显示署名"
            onChange={(e) => setAuthor(e.target.value)}
          />
          <p className="hint">笔记里没写 author 时，每页页脚用这个兜底，不用每篇笔记都手写一遍。</p>
        </div>

        <div className="field">
          <label>AI 服务商</label>
          <div className="preset-row">
            {AI_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`title-chip${p.baseUrl === draft.baseUrl ? ' is-active' : ''}`}
                onClick={() => applyPreset(p.label)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>API 地址</label>
          <input
            value={draft.baseUrl}
            placeholder="https://api.deepseek.com/v1"
            onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
          />
        </div>

        <div className="field">
          <label>模型</label>
          <input
            value={draft.model}
            placeholder="deepseek-chat"
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          />
        </div>

        <div className="field">
          <label>API Key</label>
          <input
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
          <div className="usage-row">
            <span>本次会话已发送</span>
            <strong>{formatChars(usage.chars)}</strong>
            <span className="counter">{usage.calls} 次请求</span>
          </div>
          {usage.saved > 0 && (
            <div className="usage-row usage-row--saved">
              <span>重复请求省下</span>
              <strong>{formatChars(usage.saved)}</strong>
            </div>
          )}
          <p className="hint">
            省 token 的两个办法：在编辑框里<b>选中一段</b>再点「AI 排版 / AI 去味」，就只发这一段；
            只想要封面就点「AI 封面」，它只发正文开头，已生成过文案时甚至不发请求。
          </p>
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              onSave(draft, author.trim());
              onClose();
            }}
          >
            保存
          </button>
        </footer>
      </div>
    </div>
  );
}
