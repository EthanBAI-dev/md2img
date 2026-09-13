import { parseBlocks, parseNote } from './markdown';
import type { MathError } from './math';
import { inlineImages, type ImageContext } from './images';
import { annotateImageSizes, createMeasurer, paginate, waitForAssets } from './paginate';
import { coverTitleSize, getTheme } from './themes';
import {
  MAX_CARDS,
  normalizeAdOptions,
  type AdOptions,
  type Card,
  type Note,
  type RenderOptions,
} from './types';

export interface BuildResult {
  note: Note;
  cards: Card[];
  warnings: string[];
  /** 公式渲染出错的清单，供 UI 提供「AI 修复」这类针对性操作 */
  mathErrors: MathError[];
}

/**
 * 一次完整的构建：markdown → 笔记元信息 + 分好页的卡片列表。
 * 依赖真实 DOM 测高，所以必须在浏览器环境里调用。
 */
export async function buildCards(
  markdown: string,
  options: RenderOptions,
  defaultAuthor?: string,
  adInput?: Partial<AdOptions>,
  /** 相对图片路径 → data URL。笔记正文里只存短路径，渲染时才换成图片本体 */
  imageCtx?: ImageContext,
): Promise<BuildResult> {
  const note = parseNote(markdown);
  // frontmatter 没写 author 就用设置里存的默认署名兜底，不用每篇笔记都手写一遍
  if (!note.author && defaultAuthor) note.author = defaultAuthor;
  // 主题一律以界面选择为准；frontmatter 的 theme 只在打开文件时用来初始化选择器，
  // 否则用户点了主题却不生效会很困惑
  const themeId = options.themeId;

  // mathErrors 单独交给 MathErrorPanel 处理（带「AI 修复」操作），不进 warnings 免得重复提示
  // 图片在这一步才换成 data URL：正文里始终是短路径，编辑框、存储和 AI 都不必背着 base64
  const resolved = imageCtx ? inlineImages(note.body, imageCtx) : null;
  const body = resolved ? resolved.markdown : note.body;
  const { blocks, mathErrors } = parseBlocks(body);
  const ad = normalizeAdOptions(adInput);
  const warnings: string[] = [];
  // 找不到的图必须明说：它在卡片里是一块空白，导出/发布时还会卡住或报错，
  // 而用户往往根本没意识到图库没跟过来（比如换了个页面、或图库太大没存下来）
  if (resolved?.missing.length) {
    const sample = resolved.missing.slice(0, 2).join('、');
    warnings.push(
      `有 ${resolved.missing.length} 张配图没找到（${sample}${resolved.missing.length > 2 ? ' 等' : ''}），` +
        '卡片里会是空白。重新「打开文件夹」选一次笔记所在目录即可。',
    );
  }

  await waitForAssets();
  // 必须在建量尺之前：把图片的真实宽高写进 html，否则同步测量会把未解码的图算成 0 高
  await annotateImageSizes(blocks);
  const measurer = createMeasurer(themeId, options.fontScale, options.imageMaxHeight);
  let pages: ReturnType<typeof paginate>;
  try {
    // 封面占 1 张；启用推广页时再给它预留 1 张，保证总数仍符合平台上限。
    pages = paginate(blocks, measurer, MAX_CARDS - 1 - (ad.enabled ? 1 : 0), options.keepHeadingWithBody);
  } finally {
    measurer.dispose();
  }

  if (pages.truncated) {
    warnings.push(`内容超过 ${MAX_CARDS} 张图的上限，已截断。建议拆成两篇笔记发。`);
  }
  if (pages.overflowPages.length) {
    const adOffset = ad.enabled && ad.placement === 'after-cover' ? 1 : 0;
    const list = pages.overflowPages.map((i) => i + 2 + adOffset).join('、');
    warnings.push(`第 ${list} 页内容略微超出，可以调小字号或手动加 --- 分页。`);
  }

  const theme = getTheme(themeId);

  const cards: Card[] = [
    {
      kind: 'cover',
      index: 0,
      title: note.title,
      subtitle: note.subtitle,
      badge: note.badge,
      author: note.author,
      titleSize: coverTitleSize(note.title, theme.coverBase),
    },
    ...pages.pages.map(
      (blocks, i): Card => ({
        kind: 'content',
        index: i + 1,
        header: note.title,
        blocks,
        author: note.author,
      }),
    ),
  ];

  if (ad.enabled) {
    const adCard: Card = {
      kind: 'ad',
      index: 0,
      template: ad.template,
      eyebrow: ad.eyebrow.slice(0, 20),
      title: ad.title.slice(0, 32),
      description: ad.description.slice(0, 120),
      cta: ad.cta.slice(0, 30),
      accountName: ad.accountName.slice(0, 20),
      accountIntro: ad.accountIntro.slice(0, 44),
      qrDataUrl: ad.qrDataUrl,
    };
    if (ad.placement === 'after-cover') cards.splice(1, 0, adCard);
    else cards.push(adCard);
    cards.forEach((card, index) => {
      card.index = index;
    });
  }

  return { note, cards, warnings, mathErrors };
}

/** 读取 frontmatter 里指定的主题，用于打开文件时初始化选择器 */
export function themeFromMarkdown(markdown: string): string | null {
  const declared = parseNote(markdown).theme;
  if (!declared) return null;
  return getTheme(declared).id === declared ? declared : null;
}

export { MAX_CARDS };
export type { AdOptions, Card, Note, RenderOptions };
