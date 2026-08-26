import 'katex/dist/katex.min.css';
import './core/card.css';
import './core/headless.css';
import { renderCardHTML } from './core/card';
import { waitForAssets } from './core/paginate';
import { buildCards } from './core/pipeline';
import { DEFAULT_RENDER_OPTIONS, type RenderOptions } from './core/types';

export interface HeadlessResult {
  count: number;
  title: string;
  subtitle?: string;
  tags: string[];
  warnings: string[];
  /** 每张卡片的纯文本，供 CLI 里的 AI 文案使用 */
  plainText: string;
}

declare global {
  interface Window {
    textpic: {
      render(markdown: string, options?: Partial<RenderOptions>): Promise<HeadlessResult>;
    };
  }
}

/**
 * 给 CLI 用的渲染入口：把卡片以 1:1 尺寸铺到页面上，
 * 由 Playwright 逐个元素截图 —— 比 html-to-image 更保真，也不用内联字体。
 */
window.textpic = {
  async render(markdown, options) {
    const opts: RenderOptions = { ...DEFAULT_RENDER_OPTIONS, ...options };
    const { cards, note, warnings } = await buildCards(markdown, opts);

    const host = document.getElementById('cards');
    if (!host) throw new Error('缺少 #cards 容器');
    host.innerHTML = cards.map((c) => renderCardHTML(c, opts, cards.length)).join('');
    await waitForAssets(host);

    return {
      count: cards.length,
      title: note.title,
      subtitle: note.subtitle,
      tags: note.tags,
      warnings,
      plainText: cards
        .flatMap((c) => (c.kind === 'content' ? c.blocks.map((b) => b.text) : []))
        .join('\n'),
    };
  },
};
