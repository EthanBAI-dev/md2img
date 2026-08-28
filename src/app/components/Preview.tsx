import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { renderCardHTML } from '../../core/card';
import { CARD_H, CARD_W, type Card, type RenderOptions } from '../../core/types';

const GAP = 14;
const SCALE_MIN = 0.1;
const SCALE_MAX = 0.3;
const SCALE_STEP = 0.02;
const SCALE_MID = (SCALE_MIN + SCALE_MAX) / 2;
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
  const [scale, setScale] = useState(variant === 'panel' ? 0.16 : SCALE_MAX);
  const [nav, setNav] = useState({ atStart: true, atEnd: true });

  // useLayoutEffect：在浏览器绘制前量好容器宽度算出合适缩放，避免先闪一下默认值再跳变。
  // 只有侧边栏用这套「按容器宽度自适应」——网页版屏幕够宽，直接常驻最大缩放就够用，
  // 犯不着还去随窗口宽度动态收缩，横向滚动本来就能看到更多张
  useLayoutEffect(() => {
    if (variant !== 'panel') return;
    const el = sectionRef.current;
    if (!el) return;
    // 只在「宽度」真的变了才重新算缩放。ResizeObserver 盯着整个 section，
    // 而 +/- 按钮改 scale 会连带改高度（track 高度跟着 scale 走）——
    // 如果不做这个判断，每次点 +/- 触发的高度变化都会被这里立刻用宽度重新算回原值，按钮等于失效。
    let lastWidth = -1;
    const apply = (width: number) => {
      if (width <= 0 || Math.abs(width - lastWidth) < 0.5) return;
      lastWidth = width;
      const fit = width / (CARD_W * CARDS_VISIBLE);
      setScale(Math.min(SCALE_MAX, Math.max(SCALE_MIN, fit)));
    };
    apply(el.clientWidth);
    const ro = new ResizeObserver((entries) => apply(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [variant]);

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

  const isMaxed = scale > SCALE_MID;
  const toggleMinMax = () => setScale(isMaxed ? SCALE_MIN : SCALE_MAX);

  return (
    <section className="panel panel--preview" ref={sectionRef}>
      <header className="panel-head">
        <h3>预览</h3>
        <div className="preview-controls">
          <span className="counter">{cards.length} 张</span>
          <button
            type="button"
            className="btn btn--ghost btn--xs"
            aria-label="缩小预览"
            disabled={scale <= SCALE_MIN}
            onClick={() => setScale((s) => Math.max(SCALE_MIN, +(s - SCALE_STEP).toFixed(2)))}
          >
            −
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--xs"
            aria-label="放大预览"
            disabled={scale >= SCALE_MAX}
            onClick={() => setScale((s) => Math.min(SCALE_MAX, +(s + SCALE_STEP).toFixed(2)))}
          >
            ＋
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--xs"
            aria-label={isMaxed ? '缩到最小' : '放到最大'}
            title={isMaxed ? '缩到最小' : '放到最大'}
            onClick={toggleMinMax}
          >
            {isMaxed ? '⤡' : '⤢'}
          </button>
        </div>
      </header>

      {!cards.length ? (
        <div className="preview-empty">
          左边贴上 Markdown，右边实时出图
          <span>支持 $公式$、代码块、表格、列表</span>
        </div>
      ) : (
        <div className="preview-viewport">
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
              ‹
            </button>
          )}
          {!nav.atEnd && (
            <button type="button" className="preview-nav preview-nav--right" aria-label="向右滚动" onClick={() => scrollByStep(1)}>
              ›
            </button>
          )}
        </div>
      )}
    </section>
  );
}
