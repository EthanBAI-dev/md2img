import { blobToDataUrl, imageToDataUrl } from './fileUtils';

const NOTE_EXT = ['.md', '.markdown', '.txt'];
const IMAGE_EXT = ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'];

export interface FolderNote {
  /** 显示用的文件名 */
  name: string;
  /** 相对文件夹根目录的路径，用来解析笔记里的相对图片路径 */
  path: string;
  text: string;
}

export interface FolderImport {
  notes: FolderNote[];
  /** 相对路径（去掉最外层文件夹名）→ data URL */
  images: Map<string, string>;
  /** 体积太大被跳过的图片，读完提示用户 */
  skipped: string[];
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

/**
 * webkitRelativePath 形如「零基础版_01-05/figures/desktop/01-pipeline.svg」，
 * 第一段是用户选中的那个文件夹本身，去掉之后才和笔记里写的相对路径对得上。
 */
function stripRoot(relPath: string): string {
  const i = relPath.indexOf('/');
  return i < 0 ? relPath : relPath.slice(i + 1);
}

/** 单张图的体积上限：内联成 data URL 之后大约膨胀 4/3，太大会把存储和文本框拖垮 */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * 读取用户通过 <input webkitdirectory> 选中的整个文件夹：
 * 笔记原样读成文本，图片转成 data URL 备用。
 * SVG 不走压缩——它是矢量文本，光栅化只会更大更糊。
 */
export async function readFolder(fileList: FileList | File[]): Promise<FolderImport> {
  const files = Array.from(fileList);
  const notes: FolderNote[] = [];
  const images = new Map<string, string>();
  const skipped: string[] = [];

  await Promise.all(
    files.map(async (file) => {
      const rel = stripRoot(file.webkitRelativePath || file.name);
      const ext = extOf(file.name);
      if (NOTE_EXT.includes(ext)) {
        notes.push({ name: file.name, path: rel, text: await file.text() });
        return;
      }
      if (!IMAGE_EXT.includes(ext)) return;
      if (file.size > MAX_IMAGE_BYTES) {
        skipped.push(rel);
        return;
      }
      try {
        // SVG 是矢量，走 imageToDataUrl 会被 canvas 光栅化成 JPEG，白白丢清晰度
        images.set(rel, ext === '.svg' ? await blobToDataUrl(file) : await imageToDataUrl(file));
      } catch {
        skipped.push(rel);
      }
    }),
  );

  notes.sort((a, b) => a.path.localeCompare(b.path, 'zh'));
  return { notes, images, skipped };
}

/**
 * 按相对路径找图，逐级放宽：
 * 1. 完全相等（笔记就在文件夹根目录时最常见）
 * 2. 后缀匹配（笔记在子目录里，写的相对路径少了前缀）
 * 3. 同名文件（路径对不上但文件名唯一）
 */
function resolveImage(src: string, images: Map<string, string>): string | null {
  const clean = src.replace(/^\.\//, '').split(/[?#]/)[0];
  const exact = images.get(clean);
  if (exact) return exact;

  for (const [path, dataUrl] of images) {
    if (path.endsWith(`/${clean}`) || clean.endsWith(`/${path}`)) return dataUrl;
  }

  const base = clean.split('/').pop();
  if (!base) return null;
  const sameName = [...images].filter(([path]) => path.split('/').pop() === base);
  return sameName.length === 1 ? sameName[0][1] : null;
}

function isInlineable(src: string): boolean {
  return !!src && !/^(data:|https?:|blob:)/i.test(src);
}

export interface InlineResult {
  markdown: string;
  /** 成功换成 data URL 的图片数 */
  inlined: number;
  /** 在文件夹里没找到对应文件的路径 */
  missing: string[];
}

/**
 * 从 <picture> 里挑一路留下。卡片是 1080×1440 的竖版，版式更接近手机，
 * 所以默认取 max-width 这类「窄屏」<source>（作者给手机准备的那张），
 * 没有窄屏 source 时退回 <img> 的兜底图。
 */
function pickPictureSource(inner: string, preferNarrow: boolean): string | null {
  const img = /<img\b[^>]*>/i.exec(inner)?.[0] ?? null;
  if (!preferNarrow) return img;

  // <source media="(max-width: 640px)" srcset="figures/mobile/x.svg">
  const sources = inner.match(/<source\b[^>]*>/gi) ?? [];
  for (const s of sources) {
    if (!/media=(["'])[^"']*max-width[^"']*\1/i.test(s)) continue;
    const srcset = /srcset=(["'])(.*?)\1/i.exec(s)?.[2];
    if (!srcset) continue;
    // srcset 可能是「a.svg 1x, b.svg 2x」，取第一个候选的 URL 部分
    const first = srcset.split(',')[0].trim().split(/\s+/)[0];
    if (!first) continue;
    return img ? img.replace(/\bsrc=(["']).*?\1/i, `src="${first}"`) : `<img src="${first}">`;
  }
  return img;
}

/**
 * 把笔记里的相对图片路径换成 data URL，让它脱离原文件夹也能正常渲染和导出。
 *
 * 同时把 <picture> 拍平成单个 <img>：导出用的 html-to-image 是克隆 DOM 再序列化，
 * <picture>/<source> 这类结构容易掉图，拍平最稳；而且卡片尺寸固定，
 * 本来也用不着响应式的多路候选。
 */
export function inlineImages(
  markdown: string,
  images: Map<string, string>,
  /** true=优先用作者给窄屏准备的那张图（竖版卡片更合适） */
  preferNarrow = true,
): InlineResult {
  const missing: string[] = [];
  let inlined = 0;

  const swap = (src: string): string => {
    if (!isInlineable(src)) return src;
    const found = resolveImage(src, images);
    if (!found) {
      if (!missing.includes(src)) missing.push(src);
      return src;
    }
    inlined += 1;
    return found;
  };

  // 先拍平 <picture>，只留一路 <img>
  let out = markdown.replace(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi, (whole, inner: string) =>
    pickPictureSource(inner, preferNarrow) ?? whole,
  );

  // HTML 形式：<img src="...">
  out = out.replace(/(<img\b[^>]*?\bsrc=)(["'])(.*?)\2/gi, (_m, head: string, q: string, src: string) =>
    `${head}${q}${swap(src)}${q}`,
  );

  // Markdown 形式：![alt](path)，注意 data URL 里没有空格，标题部分不处理
  out = out.replace(/(!\[[^\]]*\]\()([^)\s]+)(\))/g, (_m, head: string, src: string, tail: string) =>
    `${head}${swap(src)}${tail}`,
  );

  return { markdown: out, inlined, missing };
}
