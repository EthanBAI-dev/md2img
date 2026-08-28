import type { Card, RenderOptions } from './types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderWatermark(opts: RenderOptions): string {
  const config = opts.watermark;
  if (!config?.enabled) return '';
  const profile = config.profiles[config.activePlatform] ?? config.profiles.global;
  if (!profile) return '';
  const content =
    profile.kind === 'logo'
      ? profile.logoDataUrl
        ? `<img src="${esc(profile.logoDataUrl)}" alt="" />`
        : ''
      : esc(profile.text.trim().slice(0, 40));
  if (!content) return '';

  const opacity = Math.min(1, Math.max(0.03, Number(profile.opacity) || 0.18));
  const rotation = Math.min(180, Math.max(-180, Number(profile.rotation) || 0));
  const size = Math.min(240, Math.max(18, Number(profile.size) || 36));
  const color = /^#[0-9a-f]{6}$/i.test(profile.color) ? profile.color : '#1f2430';
  return `<div class="pm-watermark pm-watermark--${profile.kind}" data-position="${esc(profile.position)}" aria-hidden="true" style="--pm-wm-opacity:${opacity};--pm-wm-rotation:${rotation}deg;--pm-wm-size:${size}px;--pm-wm-color:${color}">${content}</div>`;
}

/** 生成一张卡片的完整 HTML。网页预览、插件导出、CLI 截图三条路走的都是这个函数 */
export function renderCardHTML(card: Card, opts: RenderOptions, total: number): string {
  const attrs =
    `class="pm-card pm-${card.kind}" data-theme="${esc(opts.themeId)}" ` +
    `data-index="${card.index}" data-card="${card.index}" ` +
    `style="--pm-font-scale:${opts.fontScale};--pm-img-max-h:${opts.imageMaxHeight}px"`;

  const author = opts.showAuthor && 'author' in card && card.author ? `@${esc(card.author)}` : '';
  const watermark = renderWatermark(opts);

  if (card.kind === 'cover') {
    const badge = card.badge ? `<div class="pm-badge">${esc(card.badge)}</div>` : '';
    const sub = card.subtitle ? `<p class="pm-cover-sub">${esc(card.subtitle)}</p>` : '';
    const hint = total > 1 ? `${total} 页 · 右滑查看 →` : '';
    return `<div ${attrs}>
  <div class="pm-deco" aria-hidden="true"></div>
  <div class="pm-cover-inner">
    ${badge}
    <h1 class="pm-cover-title" style="font-size:${card.titleSize}px"><span class="pm-cover-title-text">${esc(card.title)}</span></h1>
    <div class="pm-cover-rule" aria-hidden="true"></div>
    ${sub}
  </div>
  <div class="pm-foot">
    <span class="pm-foot-l">${author}</span>
    <span class="pm-foot-r">${hint}</span>
  </div>
  ${watermark}
</div>`;
  }

  if (card.kind === 'ad') {
    const qr = card.qrDataUrl
      ? `<img class="pm-ad-qr-image" src="${esc(card.qrDataUrl)}" alt="二维码" />`
      : `<div class="pm-ad-qr-placeholder"><span>QR</span><small>上传二维码</small></div>`;
    return `<div ${attrs} data-ad-template="${esc(card.template)}">
  <div class="pm-deco" aria-hidden="true"></div>
  <div class="pm-ad-inner">
    <div class="pm-ad-copy">
      <div class="pm-ad-eyebrow">${esc(card.eyebrow)}</div>
      <h1 class="pm-ad-title">${esc(card.title)}</h1>
      <p class="pm-ad-description">${esc(card.description)}</p>
      <div class="pm-ad-account">
        <strong>${esc(card.accountName)}</strong>
        <span>${esc(card.accountIntro)}</span>
      </div>
    </div>
    <div class="pm-ad-action">
      <div class="pm-ad-qr">${qr}</div>
      <div class="pm-ad-cta">${esc(card.cta)}</div>
    </div>
  </div>
  ${watermark}
</div>`;
  }

  const head = card.header
    ? `<div class="pm-head"><span class="pm-head-dot" aria-hidden="true"></span><span class="pm-head-text">${esc(card.header)}</span></div>`
    : '';
  const pageNo = opts.pageNumber ? `${card.index + 1} / ${total}` : '';

  return `<div ${attrs}>
  <div class="pm-deco" aria-hidden="true"></div>
  ${head}
  <div class="pm-body">${card.blocks.map((b) => b.html).join('')}</div>
  <div class="pm-foot">
    <span class="pm-foot-l">${author}</span>
    <span class="pm-foot-r">${pageNo}</span>
  </div>
  ${watermark}
</div>`;
}
