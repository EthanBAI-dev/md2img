import type { Card, RenderOptions } from './types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 生成一张卡片的完整 HTML。网页预览、插件导出、CLI 截图三条路走的都是这个函数 */
export function renderCardHTML(card: Card, opts: RenderOptions, total: number): string {
  const attrs =
    `class="pm-card pm-${card.kind}" data-theme="${esc(opts.themeId)}" ` +
    `data-index="${card.index}" data-card="${card.index}" ` +
    `style="--pm-font-scale:${opts.fontScale}"`;

  const author = opts.showAuthor && card.author ? `@${esc(card.author)}` : '';

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
</div>`;
}
