import { toBlob, getFontEmbedCSS } from 'html-to-image';
import JSZip from 'jszip';
import { renderCardHTML } from './card';
import { waitForAssets } from './paginate';
import { CARD_H, CARD_W, type Card, type RenderOptions } from './types';

export interface ExportedImage {
  name: string;
  blob: Blob;
  index: number;
}

let fontCssCache: string | null = null;
async function fontEmbedCSS(): Promise<string> {
  if (fontCssCache === null) {
    try {
      // KaTeX 的字体必须内联进 SVG，否则导出的图里公式会掉字形
      fontCssCache = await getFontEmbedCSS(document.body);
    } catch {
      fontCssCache = '';
    }
  }
  return fontCssCache;
}

/**
 * 在离屏容器里以 1:1 真实尺寸重新渲染一遍再截图。
 * 预览区的卡片被 transform 缩放过，直接截会带上缩放误差。
 */
async function withOffscreenCards<T>(
  cards: Card[],
  opts: RenderOptions,
  fn: (nodes: HTMLElement[]) => Promise<T>,
): Promise<T> {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-${CARD_W * 3}px;top:0;width:${CARD_W}px;pointer-events:none;z-index:-1;`;
  host.innerHTML = cards.map((c) => renderCardHTML(c, opts, cards.length)).join('');
  document.body.appendChild(host);
  try {
    await waitForAssets(host);
    const nodes = Array.from(host.children) as HTMLElement[];
    return await fn(nodes);
  } finally {
    host.remove();
  }
}

/** 导出全部卡片为 PNG，scale=2 时输出 2160×2880 */
export async function exportCards(
  cards: Card[],
  opts: RenderOptions,
  onProgress?: (done: number, total: number) => void,
  scale = 1,
): Promise<ExportedImage[]> {
  const embed = await fontEmbedCSS();

  return withOffscreenCards(cards, opts, async (nodes) => {
    const out: ExportedImage[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const blob = await toBlob(nodes[i], {
        width: CARD_W,
        height: CARD_H,
        canvasWidth: CARD_W * scale,
        canvasHeight: CARD_H * scale,
        pixelRatio: 1,
        cacheBust: false,
        fontEmbedCSS: embed,
        skipAutoScale: true,
      });
      if (!blob) throw new Error(`第 ${i + 1} 张图片生成失败`);
      out.push({
        name: `${String(i + 1).padStart(2, '0')}.png`,
        blob,
        index: i,
      });
      onProgress?.(i + 1, nodes.length);
    }
    return out;
  });
}

/** 打包成 zip */
export async function zipImages(images: ExportedImage[], noteTitle: string): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder(safeName(noteTitle)) ?? zip;
  for (const img of images) folder.file(img.name, img.blob);
  return zip.generateAsync({ type: 'blob' });
}

export function safeName(s: string): string {
  return (
    s
      .replace(/[\\/:*?"<>|\n\r\t]/g, '')
      .trim()
      .slice(0, 40) || '小红书笔记'
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
