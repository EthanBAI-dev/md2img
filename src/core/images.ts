/**
 * 图片路径解析：笔记里写的是 `figures/mobile/01.svg` 这样的相对路径，
 * 渲染前换成真正能显示的 data URL。
 *
 * 关键决定：**换算只在渲染时做，不写回笔记正文**。
 * 一张 SVG 内联成 base64 就是几万个字符，写回正文会让编辑框里全是乱码、
 * 存储体积翻十几倍、发给 AI 的内容也被 base64 淹掉。
 * 笔记里始终保留作者写的短路径，图片本体单独放在一张表里。
 */

export type ImageMap = Map<string, string>;

export interface ImageContext {
  images: ImageMap;
  /** <picture> 有多路候选时，优先用作者给窄屏准备的那张（竖版卡片更合适） */
  preferNarrow: boolean;
}

/**
 * 按相对路径找图，逐级放宽：
 * 1. 完全相等（笔记就在文件夹根目录时最常见）
 * 2. 后缀匹配（笔记在子目录里，写的相对路径少了前缀）
 * 3. 同名文件（路径对不上但文件名唯一）
 */
function resolveImage(src: string, images: ImageMap): string | null {
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

function isResolvable(src: string): boolean {
  return !!src && !/^(data:|https?:|blob:)/i.test(src);
}

/**
 * 从 <picture> 里挑一路留下。卡片是 1080×1440 的竖版，版式更接近手机，
 * 所以窄屏那一路（作者给手机准备的图）通常更合适；关掉就用 <img> 的兜底图。
 */
function pickPictureSource(inner: string, preferNarrow: boolean): string | null {
  const img = /<img\b[^>]*>/i.exec(inner)?.[0] ?? null;
  if (!preferNarrow) return img;

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

export interface InlineResult {
  markdown: string;
  /** 成功换成 data URL 的图片数 */
  inlined: number;
  /** 在图库里没找到对应文件的路径 */
  missing: string[];
}

/**
 * 把正文里的相对图片路径换成 data URL，供渲染/导出使用。
 *
 * 同时把 <picture> 拍平成单个 <img>：卡片尺寸固定，用不着响应式候选；
 * 而且导出用的 html-to-image 是克隆 DOM 再序列化，<picture>/<source> 容易掉图。
 */
export function inlineImages(markdown: string, ctx: ImageContext): InlineResult {
  const missing: string[] = [];
  let inlined = 0;

  const swap = (src: string): string => {
    if (!isResolvable(src)) return src;
    const found = resolveImage(src, ctx.images);
    if (!found) {
      if (!missing.includes(src)) missing.push(src);
      return src;
    }
    inlined += 1;
    return found;
  };

  let out = markdown.replace(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi, (whole, inner: string) =>
    pickPictureSource(inner, ctx.preferNarrow) ?? whole,
  );
  out = out.replace(/(<img\b[^>]*?\bsrc=)(["'])(.*?)\2/gi, (_m, head: string, q: string, src: string) =>
    `${head}${q}${swap(src)}${q}`,
  );
  out = out.replace(/(!\[[^\]]*\]\()([^)\s]+)(\))/g, (_m, head: string, src: string, tail: string) =>
    `${head}${swap(src)}${tail}`,
  );

  return { markdown: out, inlined, missing };
}
