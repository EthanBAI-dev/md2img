import { useState, type ReactNode } from 'react';

export type DotColor = 'dark' | 'green' | 'amber' | 'red' | 'douyin';

export interface Tab {
  id: string;
  label: string;
  /** 标签左侧的小圆点，用来提示这一项当前是开着的 / 已经有内容 */
  dot?: boolean;
  dotColor?: DotColor;
  content: ReactNode;
}

interface Props {
  tabs: Tab[];
  /** 撑满所在列的剩余高度（内容多了自己内部滚），而不是被内容撑高 */
  fill?: boolean;
  /** 标签栏最右侧的操作区，比如「收起这一栏」、张数统计 */
  actions?: ReactNode;
}

/**
 * 把几个功能面板收进一个带标签的窗口，下划线式标签。
 *
 * 之前每加一个功能就往列底下追加一个面板，越加越长、整列被迫上下滚动，
 * 而且水印这种平时用不到的东西常年占着一大块空白。收进标签页之后
 * 一次只显示一个，整列高度就锁死在一屏之内了。
 */
export function TabbedPanel({ tabs, fill, actions }: Props) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <section className={`panel tabbed${fill ? ' tabbed--fill' : ''}`}>
      <div className="tabbed-bar">
        <div className="tabbed-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === current?.id}
              className={`tabbed-tab${t.id === current?.id ? ' is-active' : ''}`}
              onClick={() => setActive(t.id)}
            >
              {t.dot && <span className={`tabbed-dot tabbed-dot--${t.dotColor ?? 'dark'}`} aria-hidden="true" />}
              {t.label}
            </button>
          ))}
        </div>
        {actions && <div className="tabbed-actions">{actions}</div>}
      </div>
      <div className="tabbed-body" role="tabpanel">
        {current?.content}
      </div>
    </section>
  );
}
