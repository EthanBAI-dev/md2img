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

/** 1×1 透明 PNG：加载失败的图片换成它，整组导出才不会被一张坏图拖死 */
const BLANK_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** 单张卡片截图的超时上限。超时说明卡在了某个资源上，与其一直转圈不如明确报错 */
const CARD_TIMEOUT_MS = 30000;

function withTimeout<T>(task: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    task.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * html-to-image 在资源加载失败时抛出的是 DOM Event 而不是 Error，
 * 直接展示只会得到「[object Event]」或一句笼统的「失败」，这里转成人能看懂的话
 */
export function describeExportError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof Event !== 'undefined' && err instanceof Event) {
    const target = err.target as HTMLImageElement | null;
    const src = target?.getAttribute?.('src');
    return src
      ? `图片加载失败：${src.startsWith('data:') ? '卡片内容' : src.slice(0, 80)}`
      : `生成图片时有资源加载失败（${err.type}）`;
  }
  return String(err);
}

/**
 * 在离屏容器里以 1:1 真实尺寸重新渲染一遍再截图。
 * 预览区的卡片被 transform 缩放过，直接截会带上缩放误差。
 */
async function withOffscreenCards<T>(
  cards: Card[],
  opts: RenderOptions,
  fn: (nodes: HTMLElement[], broken: string[]) => Promise<T>,
): Promise<T> {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-${CARD_W * 3}px;top:0;width:${CARD_W}px;pointer-events:none;z-index:-1;`;
  host.innerHTML = cards.map((c) => renderCardHTML(c, opts, cards.length)).join('');
  document.body.appendChild(host);
  try {
    await waitForAssets(host);
    // 加载失败的图提前换成透明像素：交给 html-to-image 的话，它会再去请求一遍坏地址，
    // 实测要么直接抛异常让整组导出失败，要么一直挂着不返回
    const broken: string[] = [];
    for (const img of Array.from(host.querySelectorAll('img'))) {
      if (img.complete && img.naturalWidth > 0) continue;
      const src = img.getAttribute('src') ?? '';
      if (src && !broken.includes(src)) broken.push(src);
      img.setAttribute('src', BLANK_PIXEL);
    }
    const nodes = Array.from(host.children) as HTMLElement[];
    return await fn(nodes, broken);
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
  /** 有图片没加载出来时回调这些地址（它们在导出图里是空白） */
  onBrokenImages?: (srcs: string[]) => void,
): Promise<ExportedImage[]> {
  const embed = await fontEmbedCSS();

  return withOffscreenCards(cards, opts, async (nodes, broken) => {
    if (broken.length) onBrokenImages?.(broken);
    const out: ExportedImage[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const blob = await withTimeout(
        toBlob(nodes[i], {
          width: CARD_W,
          height: CARD_H,
          canvasWidth: CARD_W * scale,
          canvasHeight: CARD_H * scale,
          pixelRatio: 1,
          cacheBust: false,
          fontEmbedCSS: embed,
          skipAutoScale: true,
          // 兜底：万一还有漏网的坏图，也用透明像素顶上而不是整张失败
          imagePlaceholder: BLANK_PIXEL,
        }).catch((err: unknown) => {
          throw new Error(`第 ${i + 1} 张卡片生成失败：${describeExportError(err)}`);
        }),
        CARD_TIMEOUT_MS,
        `第 ${i + 1} 张卡片生成超时，可能有图片或字体一直没加载完`,
      );
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
