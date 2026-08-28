import { useRef } from 'react';
import { DEFAULT_AD_OPTIONS, type AdOptions, type AdTemplate } from '../../core/types';
import { imageToDataUrl } from '../fileUtils';

interface Props {
  value: AdOptions;
  onChange: (value: AdOptions) => void;
}

const PRESETS: Record<AdTemplate, AdOptions> = {
  account: DEFAULT_AD_OPTIONS,
  product: {
    ...DEFAULT_AD_OPTIONS,
    template: 'product',
    eyebrow: '本期推荐 · 限时福利',
    title: '让好产品，真正解决你的问题',
    description: '在这里写产品亮点、适合人群和你愿意推荐它的理由。',
    cta: '扫码了解详情 · 领取专属福利',
    accountIntro: '产品体验、使用方法与真实案例分享',
  },
  course: {
    ...DEFAULT_AD_OPTIONS,
    template: 'course',
    eyebrow: '系统课程 · 从入门到实战',
    title: '把零散知识，变成可复用的能力',
    description: '在这里写课程收获、学习路径、适合人群和交付内容。',
    cta: '扫码查看课程大纲 · 加入学习',
    accountIntro: '体系化课程、实战案例与长期答疑',
  },
};

const TEMPLATE_LABELS: Record<AdTemplate, string> = {
  account: '账号介绍',
  product: '产品推广',
  course: '课程推广',
};

export function AdPanel({ value, onChange }: Props) {
  const qrRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<AdOptions>) => onChange({ ...value, ...patch });
  const applyPreset = (template: AdTemplate) =>
    onChange({ ...PRESETS[template], enabled: true, placement: value.placement, qrDataUrl: value.qrDataUrl });

  return (
    <section className="panel feature-panel">
      <header className="panel-head">
        <h3>广告推广页</h3>
        <label className="switch-label">
          <input type="checkbox" checked={value.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          插入
        </label>
      </header>

      {value.enabled && (
        <div className="feature-panel-body">
          <div className="preset-row" aria-label="推广页模板">
            {(Object.keys(TEMPLATE_LABELS) as AdTemplate[]).map((template) => (
              <button
                key={template}
                type="button"
                className={`title-chip${value.template === template ? ' is-active' : ''}`}
                onClick={() => applyPreset(template)}
              >
                {TEMPLATE_LABELS[template]}
              </button>
            ))}
          </div>

          <div className="field compact-field">
            <label htmlFor="adPlacement">插入位置</label>
            <select id="adPlacement" value={value.placement} onChange={(e) => set({ placement: e.target.value as AdOptions['placement'] })}>
              <option value="after-cover">封面之后</option>
              <option value="end">图文末尾</option>
            </select>
          </div>

          <div className="field-grid">
            <div className="field compact-field">
              <label htmlFor="adEyebrow">眉标题</label>
              <input id="adEyebrow" maxLength={20} value={value.eyebrow} onChange={(e) => set({ eyebrow: e.target.value })} />
            </div>
            <div className="field compact-field">
              <label htmlFor="adAccount">账号名称</label>
              <input id="adAccount" maxLength={20} value={value.accountName} onChange={(e) => set({ accountName: e.target.value })} />
            </div>
          </div>

          <div className="field compact-field">
            <label htmlFor="adTitle">推广标题</label>
            <input id="adTitle" maxLength={32} value={value.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="field compact-field">
            <label htmlFor="adDescription">推广介绍</label>
            <textarea id="adDescription" rows={3} maxLength={120} value={value.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="field compact-field">
            <label htmlFor="adAccountIntro">账号介绍</label>
            <input id="adAccountIntro" maxLength={44} value={value.accountIntro} onChange={(e) => set({ accountIntro: e.target.value })} />
          </div>
          <div className="field compact-field">
            <label htmlFor="adCta">行动按钮文案（CTA）</label>
            <input id="adCta" maxLength={30} value={value.cta} onChange={(e) => set({ cta: e.target.value })} />
          </div>

          <div className="upload-row">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => qrRef.current?.click()}>
              {value.qrDataUrl ? '更换二维码' : '上传二维码'}
            </button>
            {value.qrDataUrl && (
              <>
                <img className="upload-thumb" src={value.qrDataUrl} alt="当前二维码" />
                <button type="button" className="btn btn--ghost btn--xs" onClick={() => set({ qrDataUrl: '' })}>
                  移除
                </button>
              </>
            )}
            <input
              ref={qrRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) set({ qrDataUrl: await imageToDataUrl(file) });
                e.target.value = '';
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
