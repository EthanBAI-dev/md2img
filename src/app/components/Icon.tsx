/**
 * 界面用的线性小图标。
 *
 * 设计稿用的是 CDN 上的图标字体，扩展（MV3）页面不允许加载远程资源，
 * 国内网络下 CDN 也不稳定，所以这里自己画一套最常用的，全部内联 SVG、跟随文字颜色。
 */
const PATHS = {
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
  italic: 'M14 5h-4M14 19h-4M13 5l-2 14',
  strike: 'M5 12h14M16 7.5C15.2 6 13.8 5 12 5c-2.5 0-4 1.3-4 3 0 1.5 1 2.4 3 3M8 16.5c.8 1.5 2.2 2.5 4 2.5 2.5 0 4-1.3 4-3',
  heading: 'M6 5v14M18 5v14M6 12h12',
  quote: 'M9 7H6a1 1 0 0 0-1 1v4h4v4H6M19 7h-3a1 1 0 0 0-1 1v4h4v4h-3',
  code: 'M9 8l-4 4 4 4M15 8l4 4-4 4',
  listUl: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  listOl: 'M10 6h10M10 12h10M10 18h10M4 5l1-1v4M4 12.5h2L4 15h2M4 17h2v1.5H5 6V20H4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  image: 'M4 5h16v14H4zM4 15l4-4 5 5M13 13l2-2 5 5M15.5 8.5h.01',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  scissors: 'M8 8a2.5 2.5 0 1 0-3.5 0 2.5 2.5 0 0 0 3.5 0zM8 16a2.5 2.5 0 1 1-3.5 0 2.5 2.5 0 0 1 3.5 0zM8 8l12 10M8 16L20 6',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  minus: 'M6 12h12',
  plus: 'M12 6v12M6 12h12',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  folder: 'M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17z',
  file: 'M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20zM14 3.5V8h4M9.5 12h5M9.5 15.5h5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.8 2 2 .7-2 .8-.8 2-.7-2-2-.8 2-.7z',
  leaf: 'M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7',
  alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
  x: 'M6 6l12 12M18 6 6 18',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  copy: 'M9 9h10v11H9zM15 9V4H5v11h4',
  hash: 'M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
  send: 'M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  alert: 'M12 4 2.5 20h19zM12 10v4.5M12 17.5h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  spinner: 'M12 3a9 9 0 1 0 9 9',
} as const;

export type IconName = keyof typeof PATHS;

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}

export function Icon({ name, size = 14, className, title }: Props) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
