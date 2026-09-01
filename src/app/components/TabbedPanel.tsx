import { useState, type ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  /** 标签右侧的小圆点，用来提示这一项当前是开着的 */
  dot?: boolean;
  content: ReactNode;
}

interface Props {
  tabs: Tab[];
  /** 撑满所在列的剩余高度（内容多了自己内部滚），而不是被内容撑高 */
  fill?: boolean;
}

/**
 * 把几个功能面板收进一个带标签的窗口。
 *
 * 之前每加一个功能就往列底下追加一个面板，越加越长、整列被迫上下滚动，
 * 而且水印这种平时用不到的东西常年占着一大块空白。收进标签页之后
 * 一次只显示一个，整列高度就锁死在一屏之内了。
 */
export function TabbedPanel({ tabs, fill }: Props) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <section className={`panel tabbed${fill ? ' tabbed--fill' : ''}`}>
      <div className="tabbed-bar" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === current?.id}
            className={`tabbed-tab${t.id === current?.id ? ' is-active' : ''}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
            {t.dot && <span className="tabbed-dot" aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="tabbed-body" role="tabpanel">
        {current?.content}
      </div>
    </section>
  );
}
