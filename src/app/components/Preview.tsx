import { useCallback, useRef, useState } from 'react';
import { renderCardHTML } from '../../core/card';
import { CARD_H, CARD_W, type Card, type RenderOptions } from '../../core/types';
import { Icon } from './Icon';

const GAP = 14;
const SCALE_MIN = 0.1;
const SCALE_MAX = 0.3;
const SCALE_STEP = 0.02;
/** 一屏大致露出这么多张卡片：数值越大默认卡片越小。多出来的零头暗示「还能横向滚动」 */
const CARDS_VISIBLE = 2.1;

interface Props {
  cards: Card[];
  options: RenderOptions;
  variant: 'web' | 'panel';
}

/**
 * 胶片带式预览：所有卡片横向排成一行，高度只取决于缩放值，
 * 不会随卡片数量增多而把界面撑高。
 *
 * 网页版/全屏编辑屏幕够宽，默认直接用最大缩放，图看得清楚；
 * 侧边栏空间紧张，缩放值跟着容器宽度自适应（拖动侧边栏宽度会重新计算，尽量多露一点内容）。
 * +/- 按钮和右上角的最小/最大切换在这个基础上做手动调整，两种默认策略都不影响这两个控件。
 */
export function Preview({ cards, options, variant }: Props) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  // 自动缩放（跟着容器算）和手动缩放分开存：一旦用户点过 +/-，就以他的选择为准，
  // 容器再变化也不去覆盖他，除非他点「适应」回到自动
  const [autoScale, setAutoScale] = useState(variant === 'panel' ? 0.16 : SCALE_MAX);
  const [userScale, setUserScale] = useState<number | null>(null);
  const scale = userScale ?? autoScale;
  const setScale = (next: number | ((cur: number) => number)) =>
    setUserScale((cur) => {
      const base = cur ?? autoScale;
      const value = typeof next === 'function' ? next(base) : next;
      return Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));
    });
  const [nav, setNav] = useState({ atStart: true, atEnd: true });

  // 按可视区实际大小算出「刚好装得下」的缩放。
  //
  // 高度这一维是必须算的：卡片是 3:4 的竖版，track 高度 = CARD_H * scale + 40，
  // 之前只按宽度算，遇到矮而宽的容器就会算出一个高度放不下的值，
  // 胶片带直接顶出面板、盖住下面的样式/水印标签页。
  //
  // 观察的是 viewport 而不是整个 section：viewport 的高度由 flex 布局定死、
  // 且内部 overflow 自己滚，track 变高不会反过来改 viewport 高度，
  // 所以不会出现「改 scale → 容器变高 → 重算 scale」的自激循环。
  // 用回调 ref：空态和有卡片态是两棵不同的子树，viewport 会随内容有无挂载/卸载，
  // 写成 useEffect 只会在首次挂载时跑一次，等卡片出现时就错过了绑定
  const viewportRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      // 上一次真正采用的缩放值，用来挡住「每次只差万分之几」的碎步更新。
      // 这类微小更新自己不会停，会连成一段肉眼可见的缓慢缩小动画
      let lastApplied = -1;
      const apply = (width: number, height: number) => {
        if (width <= 0 || height <= 0) return;
        const byWidth = width / (CARD_W * (variant === 'panel' ? CARDS_VISIBLE : 1.05));
        // 只有网页版三栏才按高度收缩。
        //
        // 侧边栏里预览面板是 flex:none、高度由内容撑开，viewport 的高度就等于
        // 胶片带的高度——一旦按高度算缩放就成了闭环：
        // 缩放变小 → 胶片带变矮 → viewport 变矮 → 算出更小的缩放 → …
        // 实测会从 0.15 一路碎步缩到下限 0.10，持续两秒多，看着就像一段动画。
        // 三栏布局里 viewport 高度由列高和兄弟节点决定，与胶片带无关，才没有这个问题。
        const byHeight = variant === 'web' ? (height - GAP * 2 - 26) / CARD_H : Infinity;
        const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.min(byWidth, byHeight)));
        // 差得太小就不动：既挡住碎步循环，也避免无意义的重渲染
        if (Math.abs(next - lastApplied) < 0.004) return;
        lastApplied = next;
        setAutoScale(next);
      };
      apply(el.clientWidth, el.clientHeight);
      const ro = new ResizeObserver((entries) => {
        const box = entries[0].contentRect;
        apply(box.width, box.height);
      });
      ro.observe(el);
      return () => ro.disconnect();
    },
    [variant],
  );

  // track 只有横向可滚（overflow-x），纵向滚轮天然没有内容可滚、会原样冒泡给页面，
  // 所以这里故意不拦截滚轮事件——之前拦截纵向滚轮转横向滚动，会导致页面滑到预览区时卡住不动。
  // 横向浏览靠 Shift+滚轮、触控板双指横滑（浏览器原生支持）和下面的 ‹ › 按钮。
  //
  // 用回调 ref 是因为空态/有卡片态是两棵不同的子树，track 会随内容有无挂载/卸载，
  // 依赖数组为空的 effect 只在首次挂载时跑一次会错过重新绑定；回调 ref 每次挂载都会重新调用。
  const trackRef = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node;
    if (!node) return;
    const update = () => {
      // 阈值给宽一点：浏览器在「已经到头」时汇报的 scrollLeft 经常不是精确的 0，
      // 会有几像素的抖动（子像素取整、弹性回弹的残留量），太严格会导致到头了按钮还不消失
      const EDGE = 6;
      const max = node.scrollWidth - node.clientWidth;
      setNav({ atStart: node.scrollLeft <= EDGE, atEnd: node.scrollLeft >= max - EDGE });
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    // 缩放或卡片数量变化会改变 scrollWidth，同样需要重新判断边界
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => {
      node.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  // 一次滚一张卡片的宽度，而不是两张——点一下应该是「翻到下一张」，不是「跳过一张」
  const scrollByStep = (dir: 1 | -1) => {
    nodeRef.current?.scrollBy({ left: dir * (CARD_W * scale + GAP), behavior: 'smooth' });
  };

  /** 回到「按容器自动算」的状态，手动缩放作废 */
  const fitToBox = () => setUserScale(null);

  return (
    <section className="panel panel--preview" ref={sectionRef}>
      <header className="bar">
        <div className="bar-title">
          <Icon name="eye" size={13} />
          <span>卡片预览</span>
          <span className="badge">{cards.length} 张 · 3:4 竖版</span>
        </div>
        <div className="zoom-group">
          <button
            type="button"
            className="zoom-btn"
            aria-label="缩小预览"
            title="缩小"
            disabled={scale <= SCALE_MIN}
            onClick={() => setScale((s) => Math.max(SCALE_MIN, +(s - SCALE_STEP).toFixed(2)))}
          >
            <Icon name="minus" size={11} />
          </button>
          {/* 显示的是相对卡片真实尺寸（1080 宽）的缩放比例 */}
          <span className="zoom-value" title="相对卡片真实尺寸的缩放比例">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="zoom-btn"
            aria-label="放大预览"
            title="放大"
            disabled={scale >= SCALE_MAX}
            onClick={() => setScale((s) => Math.min(SCALE_MAX, +(s + SCALE_STEP).toFixed(2)))}
          >
            <Icon name="plus" size={11} />
          </button>
          <span className="zoom-sep" />
          <button
            type="button"
            className={`zoom-btn zoom-btn--text${userScale === null ? ' is-active' : ''}`}
            title="按窗口大小自动适应"
            onClick={fitToBox}
          >
            <Icon name="expand" size={11} />
            自适应
          </button>
        </div>
      </header>

      {!cards.length ? (
        <div className="preview-empty">
          <Icon name="image" size={22} />
          写下 Markdown，这里实时出图
          <span>支持 $公式$、代码块、表格、列表</span>
        </div>
      ) : (
        <div className="preview-viewport" ref={viewportRef}>
          <div ref={trackRef} className="preview-track" style={{ height: CARD_H * scale + 40 }}>
            {cards.map((card) => (
              <figure
                key={card.index}
                className="preview-item"
                style={{ width: CARD_W * scale, height: CARD_H * scale }}
              >
                <div
                  className="preview-scaler"
                  style={{ transform: `scale(${scale})` }}
                  dangerouslySetInnerHTML={{ __html: renderCardHTML(card, options, cards.length) }}
                />
                <figcaption>
                  {card.index + 1}
                  {card.kind === 'cover' ? ' · 封面' : ''}
                  {card.kind === 'ad' ? ' · 推广页' : ''}
                </figcaption>
              </figure>
            ))}
          </div>
          {/* 浮在图片上方的翻页按钮，半透明，滚到头的那一侧就不显示了 */}
          {!nav.atStart && (
            <button type="button" className="preview-nav preview-nav--left" aria-label="向左滚动" onClick={() => scrollByStep(-1)}>
              <Icon name="chevronLeft" size={14} />
            </button>
          )}
          {!nav.atEnd && (
            <button type="button" className="preview-nav preview-nav--right" aria-label="向右滚动" onClick={() => scrollByStep(1)}>
              <Icon name="chevronRight" size={14} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
