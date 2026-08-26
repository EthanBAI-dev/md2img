/** 侧边栏 ↔ background ↔ 创作平台 content script 之间的消息约定 */

export interface PublishPayload {
  /** 卡片图片，data:image/png;base64 形式 */
  images: string[];
  title: string;
  body: string;
  tags: string[];
  createdAt: number;
}

export const CREATOR_URL = 'https://creator.xiaohongshu.com/publish/publish?source=official';
export const CREATOR_MATCH = 'https://creator.xiaohongshu.com/*';

export type PanelToBackground = { type: 'TEXTPIC_PUBLISH' };

export type BackgroundToContent = { type: 'TEXTPIC_FILL' };

export interface FillResult {
  ok: boolean;
  message: string;
  /** 哪些步骤成功了，便于定位是选择器失效还是页面没加载完 */
  steps: { name: string; ok: boolean; detail?: string }[];
}
