import { CARD_W, CONTENT_H_FALLBACK, MAX_CARDS, type Block } from './types';
import { splitBlock } from './split';

interface Metrics {
  /** 从本块顶到下一块顶的距离（含外边距合并后的真实间距） */
  advance: number[];
  /** 本块自身的高度 */
  height: number[];
  /**
   * 这批块排在一起时正文区的真实总高。
   * 不能拿 advance 累加来代替：advance 是相邻块 offsetTop 之差，
   * 漏掉了首块自身的上边距，累加出来会偏小，导致溢出检测不出来、内容被裁掉。
   */
  total: number;
}

export interface Measurer {
  measure(blocks: Block[]): Metrics;
  /** 一页真正能装下内容的高度（已扣掉页眉页脚和主题各自的内边距） */
  readonly contentHeight: number;
  dispose(): void;
}

/**
 * 建一个离屏的、与真实卡片完全同款的容器用于测高。
 * 关键点：宽度、内边距、字体、行高、主题变量、图片高度上限都必须和最终渲染一致，
 * 只要有一处对不上，测出来的高度就是假的——分页会按错误高度装页，渲染时再溢出。
 */
export function createMeasurer(themeId: string, fontScale: number, imageMaxHeight: number): Measurer {
  const host = document.createElement('div');
  host.className = 'pm-measure-host';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-${CARD_W * 3}px;top:0;width:${CARD_W}px;height:0;overflow:hidden;pointer-events:none;z-index:-1;`;

  // 标尺卡片：保持 1440 真实高度，页眉页脚都在，用它量出正文区到底有多高
  const gauge = document.createElement('div');
  gauge.className = 'pm-card pm-content';
  gauge.dataset.theme = themeId;
  gauge.style.setProperty('--pm-font-scale', String(fontScale));
  gauge.style.setProperty('--pm-img-max-h', `${imageMaxHeight}px`);
  gauge.innerHTML =
    '<div class="pm-head"><span class="pm-head-dot"></span><span class="pm-head-text">标尺</span></div>' +
    '<div class="pm-body"></div>' +
    '<div class="pm-foot"><span>@x</span><span>1 / 2</span></div>';

  // 量尺卡片：高度放开，用来测每个块的高度
  const card = document.createElement('div');
  card.className = 'pm-card pm-content pm-measure-card';
  card.dataset.theme = themeId;
  card.style.setProperty('--pm-font-scale', String(fontScale));
  card.style.setProperty('--pm-img-max-h', `${imageMaxHeight}px`);

  const body = document.createElement('div');
  body.className = 'pm-body';

  card.appendChild(body);
  host.appendChild(gauge);
  host.appendChild(card);
  document.body.appendChild(host);

  const gaugeBody = gauge.querySelector<HTMLElement>('.pm-body');
  const contentHeight = gaugeBody?.clientHeight || CONTENT_H_FALLBACK;

  return {
    contentHeight,
    measure(blocks) {
      body.innerHTML = blocks.map((b) => b.html).join('');
      const children = Array.from(body.children) as HTMLElement[];
      const total = body.scrollHeight;

      const advance: number[] = [];
      const height: number[] = [];
      for (let i = 0; i < children.length; i++) {
        const top = children[i].offsetTop;
        const nextTop = i + 1 < children.length ? children[i + 1].offsetTop : total;
        advance.push(Math.max(0, nextTop - top));
        height.push(children[i].offsetHeight);
      }

      // 块数和子元素数不一致时（某个块渲染出多个顶层元素）做一次兜底对齐
      while (advance.length < blocks.length) {
        advance.push(0);
        height.push(0);
      }
      return { advance, height, total };
    },
    dispose() {
      host.remove();
    },
  };
}

/**
 * 给块里的每个 <img> 补上 width/height 属性，让它在插进量尺卡片的瞬间就有确定高度。
 *
 * 不这么做的话：measure() 是同步的，插入 <img> 后立刻读高度，而图片解码是异步的，
 * 没有尺寸属性的图这时布局高度是 0——分页会以为它不占地方，把它塞进快满的一页，
 * 等真正渲染时图片撑开，就从卡片底部溢出去了，而且因为测出来是 0，
 * overflowPages 还检查不出来，连警告都不会报。
 *
 * 只补属性、不写死样式：浏览器用 width/height 算出宽高比来预留空间，
 * 最终显示尺寸仍然由 card.css 里的 width/max-height/object-fit 说了算。
 */
export async function annotateImageSizes(blocks: Block[]): Promise<void> {
  const cache = new Map<string, Promise<{ w: number; h: number } | null>>();
  const probe = (src: string) => {
    let hit = cache.get(src);
    if (!hit) {
      hit = new Promise<{ w: number; h: number } | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(null); // 坏图不阻塞排版，退回原样
        setTimeout(() => resolve(null), 8000); // 既不 load 也不 error 的情况，别让排版一直卡着
        img.src = src;
      });
      cache.set(src, hit);
    }
    return hit;
  };

  await Promise.all(
    blocks.map(async (block) => {
      if (!block.html.includes('<img')) return;
      const doc = new DOMParser().parseFromString(`<body>${block.html}</body>`, 'text/html');
      const imgs = Array.from(doc.querySelectorAll('img'));
      // 已经自带尺寸的就不动，作者写的优先
      const todo = imgs.filter((img) => img.getAttribute('src') && !(img.hasAttribute('width') && img.hasAttribute('height')));
      if (!todo.length) return;
      const sizes = await Promise.all(todo.map((img) => probe(img.getAttribute('src')!)));
      let changed = false;
      todo.forEach((img, i) => {
        const size = sizes[i];
        if (!size || !size.w || !size.h) return;
        img.setAttribute('width', String(size.w));
        img.setAttribute('height', String(size.h));
        changed = true;
      });
      if (changed) block.html = doc.body.innerHTML;
    }),
  );
}

/** 等图片解码完成，否则 <img> 会以 0 高参与测量 */
export async function waitForAssets(root: ParentNode = document): Promise<void> {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* 字体加载失败不阻塞排版 */
    }
  }
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
            // 有些失败既不触发 load 也不触发 error（比如地址返回的根本不是图片），不能无限等
            setTimeout(resolve, 8000);
          }),
    ),
  );
}

export interface PaginateResult {
  pages: Block[][];
  /** 仍然放不下的页序号（0 基，相对内容页） */
  overflowPages: number[];
  /** 是否因为超过 18 张上限被截断 */
  truncated: boolean;
}

/**
 * 贪心装页：逐块累加 advance，放不下就开新页。
 * 单块就超过一页高度的，先按类型切分再重新测量，最多迭代 3 轮。
 */
export function paginate(
  blocks: Block[],
  measurer: Measurer,
  maxContentPages: number,
  keepHeadingWithBody = true,
): PaginateResult {
  const limit = measurer.contentHeight;
  let working = blocks;

  for (let round = 0; round < 3; round++) {
    const { height } = measurer.measure(working);
    const next: Block[] = [];
    let didSplit = false;

    working.forEach((block, i) => {
      const h = height[i] ?? 0;
      if (h > limit && h > 0) {
        const parts = Math.ceil(h / limit);
        const pieces = splitBlock(block, parts);
        if (pieces.length > 1) {
          didSplit = true;
          // 强制分页标记只保留在第一片上
          pieces.forEach((p, idx) => next.push(idx === 0 ? p : { ...p, pageBreak: false }));
          return;
        }
      }
      next.push(block);
    });

    working = next;
    if (!didSplit) break;
  }

  const { advance, height } = measurer.measure(working);
  const pages: Block[][] = [];
  let current: Block[] = [];
  let used = 0;

  const flush = () => {
    if (current.length) {
      pages.push(current);
      current = [];
      used = 0;
    }
  };

  working.forEach((block, i) => {
    const adv = advance[i] ?? 0;
    const h = height[i] ?? 0;

    if (block.pageBreak) flush();

    // used 是已占高度，本块自身高度 h 必须完整放下
    if (current.length && used + h > limit) flush();

    current.push(block);
    used += adv;
  });
  flush();

  /** 一组块排在一起时正文区的真实总高（含首块上边距） */
  const pageHeight = (page: Block[]): number => (page.length ? measurer.measure(page).total : 0);

  // 贪心装页时 used 是 advance 累加出来的，同样漏掉了首块的上边距，
  // 于是偶尔会把一页塞超一点点（十几像素，肉眼上就是最后一行被裁掉半截）。
  // 这里按真实总高复核一遍，超了就把末尾的块顺延到下一页。
  // 只有一个块的页不动——单块超高是 splitBlock 的职责，挪走也没用（比如图片根本切不开）。
  for (let i = 0; i < pages.length; i++) {
    let guard = pages[i].length;
    while (pages[i].length > 1 && pageHeight(pages[i]) > limit && guard-- > 0) {
      const moved = pages[i].pop()!;
      if (i + 1 >= pages.length) pages.push([]);
      pages[i + 1].unshift(moved);
    }
  }

  // 标题孤行：标题落在页尾、正文却在下一页，读起来很割裂，把标题挪过去。
  // 但下一页要装得下才挪，否则等于把溢出转移了一页。
  // 关掉这个选项就不挪，每一页尽量塞满
  if (keepHeadingWithBody) {
    for (let i = 0; i < pages.length - 1; i++) {
      const page = pages[i];
      const last = page[page.length - 1];
      if (page.length > 1 && last.kind === 'heading') {
        const moved = [last, ...pages[i + 1]];
        if (pageHeight(moved) <= limit) {
          page.pop();
          pages[i + 1] = moved;
        }
      }
    }
  }

  const finalMetrics = pages.map(pageHeight);
  const overflowPages = finalMetrics
    .map((h, i) => (h > limit + 2 ? i : -1))
    .filter((i) => i >= 0);

  const truncated = pages.length > maxContentPages;
  return {
    pages: truncated ? pages.slice(0, maxContentPages) : pages,
    overflowPages,
    truncated,
  };
}

export { MAX_CARDS };
