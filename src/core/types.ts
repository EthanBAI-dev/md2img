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
    }
  | {
      kind: 'ad';
      index: number;
      template: AdTemplate;
      eyebrow: string;
      title: string;
      description: string;
      cta: string;
      accountName: string;
      accountIntro: string;
      qrDataUrl: string;
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
  /** 预览和导出共用的水印策略 */
  watermark: WatermarkOptions;
}

export type WatermarkPlatform = 'global' | 'xiaohongshu' | 'wechat' | 'moments';
export type WatermarkKind = 'text' | 'logo';
export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface WatermarkStyle {
  kind: WatermarkKind;
  text: string;
  logoDataUrl: string;
  opacity: number;
  position: WatermarkPosition;
  rotation: number;
  size: number;
  color: string;
}

export interface WatermarkOptions {
  enabled: boolean;
  /** 当前预览/导出使用哪套策略；global 是所有平台共用的默认策略 */
  activePlatform: WatermarkPlatform;
  profiles: Record<WatermarkPlatform, WatermarkStyle>;
}

export type AdTemplate = 'account' | 'product' | 'course';
export type AdPlacement = 'after-cover' | 'end';

export interface AdOptions {
  enabled: boolean;
  template: AdTemplate;
  placement: AdPlacement;
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  accountName: string;
  accountIntro: string;
  qrDataUrl: string;
}

export const DEFAULT_WATERMARK_STYLE: WatermarkStyle = {
  kind: 'text',
  text: '@你的账号',
  logoDataUrl: '',
  opacity: 0.18,
  position: 'bottom-right',
  rotation: -12,
  size: 36,
  color: '#1f2430',
};

function watermarkStyle(overrides: Partial<WatermarkStyle> = {}): WatermarkStyle {
  return { ...DEFAULT_WATERMARK_STYLE, ...overrides };
}

export const DEFAULT_WATERMARK_OPTIONS: WatermarkOptions = {
  enabled: false,
  activePlatform: 'global',
  profiles: {
    global: watermarkStyle(),
    xiaohongshu: watermarkStyle({ position: 'bottom-right' }),
    wechat: watermarkStyle({ position: 'bottom-center', opacity: 0.14 }),
    moments: watermarkStyle({ position: 'center', opacity: 0.1, rotation: -24 }),
  },
};

export const DEFAULT_AD_OPTIONS: AdOptions = {
  enabled: false,
  template: 'account',
  placement: 'end',
  eyebrow: '关注我 · 持续更新',
  title: '把复杂知识，讲得简单好懂',
  description: '每周更新实用方法、案例拆解和可直接复用的模板。',
  cta: '扫码关注 · 获取更多内容',
  accountName: '@你的账号',
  accountIntro: '专注分享高质量干货与实践经验',
  qrDataUrl: '',
};

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  themeId: 'cream',
  pageNumber: true,
  fontScale: 1,
  showAuthor: true,
  keepHeadingWithBody: true,
  watermark: DEFAULT_WATERMARK_OPTIONS,
};

/** 兼容旧版本存储的浅层配置，并补齐后来新增的水印字段。 */
export function normalizeRenderOptions(input?: Partial<RenderOptions>): RenderOptions {
  const incomingWatermark = input?.watermark;
  return {
    ...DEFAULT_RENDER_OPTIONS,
    ...input,
    watermark: {
      ...DEFAULT_WATERMARK_OPTIONS,
      ...incomingWatermark,
      profiles: {
        global: watermarkStyle(incomingWatermark?.profiles?.global),
        xiaohongshu: watermarkStyle(incomingWatermark?.profiles?.xiaohongshu),
        wechat: watermarkStyle(incomingWatermark?.profiles?.wechat),
        moments: watermarkStyle(incomingWatermark?.profiles?.moments),
      },
    },
  };
}

export function normalizeAdOptions(input?: Partial<AdOptions>): AdOptions {
  return { ...DEFAULT_AD_OPTIONS, ...input };
}

/** 网页版和 CLI 共用的一次完整输入 */
export interface TextPicInput {
  markdown: string;
  options: RenderOptions;
}
