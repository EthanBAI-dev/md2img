/** 小红书标准图片尺寸：3:4 竖版，1080×1440 是官方推荐的最佳清晰度 */
export const CARD_W = 1080;
export const CARD_H = 1440;

/** 卡片内边距与页脚高度，内容区高度由此推导 */
export const PAD_X = 84;
export const PAD_TOP = 92;
export const PAD_BOTTOM = 72;
export const FOOTER_H = 56;

export const CONTENT_W = CARD_W - PAD_X * 2;
/**
 * 内容区高度的兜底估值。实际排版用的是 Measurer 量出来的真实值 ——
 * 页眉高度、主题自定义的内边距、字号缩放都会影响它，写死会算不准。
 */
export const CONTENT_H_FALLBACK = CARD_H - PAD_TOP - PAD_BOTTOM - FOOTER_H - 100;

/** 小红书单篇笔记最多 18 张图 */
export const MAX_CARDS = 18;

/** Markdown 解析后的一个顶层块 */
export interface Block {
  /** markdown-it 的顶层 token 类型，如 paragraph_open / bullet_list_open */
  type: string;
  /** 语义化类型，用于排版决策 */
  kind: 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'math' | 'table' | 'image' | 'hr' | 'other';
  /** 标题层级，仅 kind === 'heading' 时有值 */
  level?: number;
  /** 渲染好的 HTML 片段 */
  html: string;
  /** 原始纯文本，用于 AI 文案和封面提取 */
  text: string;
  /** 强制分页标记（来自 <!-- page --> 或 --- ） */
  pageBreak?: boolean;
}

/** 一张待渲染的卡片 */
export type Card =
  | {
      kind: 'cover';
      index: number;
      title: string;
      subtitle?: string;
      badge?: string;
      author?: string;
      /** 封面标题的自适应字号 */
      titleSize: number;
    }
  | {
      kind: 'content';
      index: number;
      /** 页眉显示的笔记名 */
      header?: string;
      blocks: Block[];
      author?: string;
    };

/** 笔记 frontmatter + 正文 */
export interface Note {
  title: string;
  subtitle?: string;
  badge?: string;
  author?: string;
  tags: string[];
  theme?: string;
  body: string;
}

export interface RenderOptions {
  themeId: string;
  /** 是否显示页码 */
  pageNumber: boolean;
  /** 正文整体缩放，0.7 ~ 1.3 */
  fontScale: number;
  /** 是否在每页页脚显示作者 */
  showAuthor: boolean;
  /**
   * 标题落在页尾、正文却翻到下一页时，把标题也挪过去。
   * 排版上更整齐，代价是前一页会空出一块。关掉就优先塞满每一页。
   */
  keepHeadingWithBody: boolean;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  themeId: 'cream',
  pageNumber: true,
  fontScale: 1,
  showAuthor: true,
  keepHeadingWithBody: true,
};

/** 网页版和 CLI 共用的一次完整输入 */
export interface TextPicInput {
  markdown: string;
  options: RenderOptions;
}
