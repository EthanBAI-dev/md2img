import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

/** 三栏默认等宽 */
export const EQUAL_COLUMNS: [number, number, number] = [1, 1, 1];
/** 单栏最小占比，防止把某一栏拖没了。和 CSS 里的 minmax 下限是两道保险 */
const MIN_FRACTION = 0.35;

export interface ColumnWidths {
  /** 挂在 grid 容器上：只写 CSS 变量，好让窄屏媒体查询仍能覆盖布局 */
  style: CSSProperties;
  /** 分隔条的 onPointerDown，index 0 分隔第 1/2 栏，1 分隔第 2/3 栏 */
  startDrag: (index: 0 | 1) => (e: ReactPointerEvent<HTMLElement>) => void;
  /** 双击分隔条恢复等宽 */
  reset: () => void;
  dragging: number | null;
}

/**
 * 可拖拽的三栏宽度。
 *
 * 拖动时只在相邻两栏之间搬运宽度，总和保持不变——这样拖任何一条分隔条
 * 都不会影响到第三栏，符合直觉。
 */
export function useColumnWidths(
  initial: [number, number, number],
  onCommit?: (next: [number, number, number]) => void,
): ColumnWidths & { widths: [number, number, number]; setWidths: (w: [number, number, number]) => void } {
  const [widths, setWidths] = useState<[number, number, number]>(initial);
  const [dragging, setDragging] = useState<number | null>(null);
  const latest = useRef(widths);
  latest.current = widths;

  const startDrag = useCallback(
    (index: 0 | 1) => (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      const handle = e.currentTarget;
      const grid = handle.parentElement;
      if (!grid) return;

      const startX = e.clientX;
      const start = [...latest.current] as [number, number, number];
      const total = start[0] + start[1] + start[2];
      // 把像素位移换算成占比：拿三栏实际占的像素宽做换算基准
      const cols = Array.from(grid.children).filter((c) => c.classList.contains('col'));
      const pxTotal = cols.reduce((n, c) => n + c.getBoundingClientRect().width, 0);
      if (pxTotal <= 0) return;
      const perPx = total / pxTotal;

      handle.setPointerCapture(e.pointerId);
      setDragging(index);

      const move = (ev: PointerEvent) => {
        const delta = (ev.clientX - startX) * perPx;
        const a = start[index] + delta;
        const b = start[index + 1] - delta;
        // 撞到下限就停住，不要把宽度搬成负数
        if (a < MIN_FRACTION || b < MIN_FRACTION) return;
        const next = [...start] as [number, number, number];
        next[index] = a;
        next[index + 1] = b;
        setWidths(next);
      };
      const up = () => {
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        setDragging(null);
        onCommit?.(latest.current);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    },
    [onCommit],
  );

  const reset = useCallback(() => {
    setWidths([...EQUAL_COLUMNS] as [number, number, number]);
    onCommit?.([...EQUAL_COLUMNS] as [number, number, number]);
  }, [onCommit]);

  return {
    widths,
    setWidths,
    dragging,
    reset,
    startDrag,
    style: {
      '--c1': `${widths[0]}fr`,
      '--c2': `${widths[1]}fr`,
      '--c3': `${widths[2]}fr`,
    } as CSSProperties,
  };
}

/** 中栏「预览 / 设置面板」的默认高度分配：设置面板占 42% */
export const DEFAULT_PANEL_RATIO = 0.42;
const MIN_RATIO = 0.12;
const MAX_RATIO = 0.78;

/**
 * 中栏下半部分（样式/水印/广告页那个标签窗口）的高度，上下拖拽调整。
 * 存成占列高的比例而不是像素——换个窗口大小还能保持同样的观感。
 */
export function useRowHeight(initial: number, onCommit?: (next: number) => void) {
  const [ratio, setRatio] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const latest = useRef(ratio);
  latest.current = ratio;

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      const handle = e.currentTarget;
      const col = handle.parentElement;
      if (!col) return;
      const colH = col.getBoundingClientRect().height;
      if (colH <= 0) return;
      const startY = e.clientY;
      const start = latest.current;

      handle.setPointerCapture(e.pointerId);
      setDragging(true);
      const move = (ev: PointerEvent) => {
        // 往下拖 = 设置面板变矮，所以取负号
        const next = start - (ev.clientY - startY) / colH;
        setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, next)));
      };
      const up = () => {
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        setDragging(false);
        onCommit?.(latest.current);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    },
    [onCommit],
  );

  const reset = useCallback(() => {
    setRatio(DEFAULT_PANEL_RATIO);
    onCommit?.(DEFAULT_PANEL_RATIO);
  }, [onCommit]);

  return { ratio, setRatio, dragging, startDrag, reset };
}
