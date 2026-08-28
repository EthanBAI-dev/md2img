import { useRef } from 'react';
import {
  type RenderOptions,
  type WatermarkPlatform,
  type WatermarkPosition,
  type WatermarkStyle,
} from '../../core/types';
import { imageToDataUrl } from '../fileUtils';

interface Props {
  options: RenderOptions;
  onChange: (options: RenderOptions) => void;
}

const PLATFORM_LABELS: Record<WatermarkPlatform, string> = {
  global: '全局默认',
  xiaohongshu: '小红书',
  wechat: '公众号',
  moments: '朋友圈',
};

const POSITION_LABELS: Record<WatermarkPosition, string> = {
  'top-left': '左上',
  'top-center': '顶部居中',
  'top-right': '右上',
  'center-left': '左侧居中',
  center: '正中',
  'center-right': '右侧居中',
  'bottom-left': '左下',
  'bottom-center': '底部居中',
  'bottom-right': '右下',
};

export function WatermarkPanel({ options, onChange }: Props) {
  const logoRef = useRef<HTMLInputElement>(null);
  const config = options.watermark;
  const platform = config.activePlatform;
  const profile = config.profiles[platform];

  const setConfig = (patch: Partial<typeof config>) =>
    onChange({ ...options, watermark: { ...config, ...patch } });
  const setProfile = (patch: Partial<WatermarkStyle>) =>
    setConfig({ profiles: { ...config.profiles, [platform]: { ...profile, ...patch } } });

  return (
    <section className="panel feature-panel">
      <header className="panel-head">
        <h3>水印</h3>
        <label className="switch-label">
          <input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ enabled: e.target.checked })} />
          启用
        </label>
      </header>

      {config.enabled && (
        <div className="feature-panel-body">
          <div className="field compact-field">
            <label htmlFor="watermarkPlatform">当前预览 / 导出策略</label>
            <div className="inline-control">
              <select
                id="watermarkPlatform"
                value={platform}
                onChange={(e) => setConfig({ activePlatform: e.target.value as WatermarkPlatform })}
              >
                {(Object.keys(PLATFORM_LABELS) as WatermarkPlatform[]).map((id) => (
                  <option key={id} value={id}>{PLATFORM_LABELS[id]}</option>
                ))}
              </select>
              {platform !== 'global' && (
                <button
                  type="button"
                  className="btn btn--ghost btn--xs"
                  title="用全局配置覆盖当前平台策略"
                  onClick={() => setProfile(config.profiles.global)}
                >
                  复制全局
                </button>
              )}
            </div>
          </div>

          <div className="segmented-control" aria-label="水印类型">
            <button type="button" className={profile.kind === 'text' ? 'is-active' : ''} onClick={() => setProfile({ kind: 'text' })}>文字</button>
            <button type="button" className={profile.kind === 'logo' ? 'is-active' : ''} onClick={() => setProfile({ kind: 'logo' })}>Logo</button>
          </div>

          {profile.kind === 'text' ? (
            <div className="field compact-field">
              <label htmlFor="watermarkText">水印文字</label>
              <input id="watermarkText" maxLength={40} value={profile.text} onChange={(e) => setProfile({ text: e.target.value })} placeholder="例如 @品牌账号" />
            </div>
          ) : (
            <div className="upload-row">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => logoRef.current?.click()}>
                {profile.logoDataUrl ? '更换 Logo' : '上传 Logo'}
              </button>
              {profile.logoDataUrl && <img className="upload-thumb" src={profile.logoDataUrl} alt="当前 Logo" />}
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setProfile({ logoDataUrl: await imageToDataUrl(file) });
                  e.target.value = '';
                }}
              />
            </div>
          )}

          <div className="field-grid">
            <div className="field compact-field">
              <label htmlFor="watermarkPosition">位置</label>
              <select id="watermarkPosition" value={profile.position} onChange={(e) => setProfile({ position: e.target.value as WatermarkPosition })}>
                {(Object.keys(POSITION_LABELS) as WatermarkPosition[]).map((id) => (
                  <option key={id} value={id}>{POSITION_LABELS[id]}</option>
                ))}
              </select>
            </div>
            {profile.kind === 'text' && (
              <div className="field compact-field">
                <label htmlFor="watermarkColor">颜色</label>
                <input id="watermarkColor" className="color-input" type="color" value={profile.color} onChange={(e) => setProfile({ color: e.target.value })} />
              </div>
            )}
          </div>

          <div className="control-row dense-control">
            <label htmlFor="watermarkOpacity">透明度</label>
            <input id="watermarkOpacity" type="range" min={3} max={100} value={Math.round(profile.opacity * 100)} onChange={(e) => setProfile({ opacity: Number(e.target.value) / 100 })} />
            <span className="counter">{Math.round(profile.opacity * 100)}%</span>
          </div>
          <div className="control-row dense-control">
            <label htmlFor="watermarkRotation">旋转</label>
            <input id="watermarkRotation" type="range" min={-90} max={90} value={profile.rotation} onChange={(e) => setProfile({ rotation: Number(e.target.value) })} />
            <span className="counter">{profile.rotation}°</span>
          </div>
          <div className="control-row dense-control">
            <label htmlFor="watermarkSize">大小</label>
            <input id="watermarkSize" type="range" min={18} max={240} value={profile.size} onChange={(e) => setProfile({ size: Number(e.target.value) })} />
            <span className="counter">{profile.size}px</span>
          </div>
        </div>
      )}
    </section>
  );
}
