/** 侧边栏 ↔ background ↔ 创作平台 content script 之间的消息约定 */

export type PlatformId = 'xiaohongshu' | 'douyin';

export interface PublishPayload {
  /** 这份内容要发到哪个平台 */
  platform: PlatformId;
  /** 卡片图片，data:image/png;base64 形式 */
  images: string[];
  title: string;
  body: string;
  tags: string[];
  createdAt: number;
}

export interface PublishTarget {
  id: PlatformId;
  name: string;
  /** 新开标签页时打开的发布页（直接落在「图文」上传入口） */
  url: string;
  /** 用来找已经开着的发布页，有就复用，不重复开 */
  match: string;
  /** 平台对标题长度的硬上限，超了会被截断或拒绝 */
  titleMax: number;
  bodyMax: number;
  /** 话题个数上限：小红书最多 10 个；抖音话题太多显得像刷量，文案规则里收在 5 个 */
  tagMax: number;
}

export const PUBLISH_TARGETS: Record<PlatformId, PublishTarget> = {
  xiaohongshu: {
    id: 'xiaohongshu',
    name: '小红书',
    url: 'https://creator.xiaohongshu.com/publish/publish?source=official',
    match: 'https://creator.xiaohongshu.com/publish/*',
    titleMax: 20,
    bodyMax: 1000,
    tagMax: 10,
  },
  douyin: {
    id: 'douyin',
    name: '抖音',
    url: 'https://creator.douyin.com/creator-micro/content/upload?default-tab=3',
    match: 'https://creator.douyin.com/creator-micro/*',
    titleMax: 20,
    bodyMax: 1000,
    tagMax: 5,
  },
};

export type PanelToBackground = { type: 'TEXTPIC_PUBLISH'; platform: PlatformId };

export type BackgroundToContent = { type: 'TEXTPIC_FILL'; platform: PlatformId };

export interface FillStep {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface FillResult {
  ok: boolean;
  message: string;
  /** 哪些步骤成功了，便于定位是选择器失效还是页面没加载完 */
  steps: FillStep[];
}
