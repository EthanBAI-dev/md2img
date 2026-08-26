export interface ThemeMeta {
  id: string;
  name: string;
  desc: string;
  /** 选择器上小圆点的双色渐变，一眼区分各套模板 */
  swatch: [string, string];
  /** 封面标题字号的基准值（px，1080 宽画布下），实际字号会按标题长度自适应 */
  coverBase: number;
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'cream',
    name: '奶油暖橘',
    desc: '米白底 + 暖橘强调，手账感，通用性最好',
    swatch: ['#FDF6EC', '#F2733E'],
    coverBase: 104,
  },
  {
    id: 'ink',
    name: '水墨极简',
    desc: '纯白衬线 + 印章红，干货、书摘、学术笔记',
    swatch: ['#FFFFFF', '#C0392B'],
    coverBase: 100,
  },
  {
    id: 'dopamine',
    name: '多巴胺',
    desc: '高饱和渐变 + 白色大字报，情绪化观点、涨粉封面',
    swatch: ['#FF5F9E', '#7C5CFF'],
    coverBase: 124,
  },
  {
    id: 'midnight',
    name: '暗夜科技',
    desc: '深色底 + 荧光青紫，代码、技术干货',
    swatch: ['#12151D', '#22D3EE'],
    coverBase: 108,
  },
  {
    id: 'grid',
    name: '方格笔记本',
    desc: '网格纸背景 + 荧光笔标记，学习笔记、公式推导',
    swatch: ['#F7FAFF', '#2F6BFF'],
    coverBase: 100,
  },
  {
    id: 'magazine',
    name: '杂志风',
    desc: '大留白 + 衬线标题 + 细金线，审美向、长文摘录',
    swatch: ['#F1EFEA', '#A67C3D'],
    coverBase: 96,
  },
];

export const DEFAULT_THEME = 'cream';

export function getTheme(id: string | undefined): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/**
 * 封面标题字号自适应：中文标题 6 字和 24 字用同一个字号会很难看。
 * 按字符数分档缩放，中英文按视觉宽度折算（英文/数字算半个）。
 */
export function coverTitleSize(title: string, base: number): number {
  const width = [...title].reduce((sum, ch) => sum + (/[\x00-\xff]/.test(ch) ? 0.55 : 1), 0);
  let size = base;
  if (width > 8) size = base * 0.92;
  if (width > 12) size = base * 0.8;
  if (width > 16) size = base * 0.68;
  if (width > 22) size = base * 0.56;
  if (width > 30) size = base * 0.46;
  return Math.round(size);
}
