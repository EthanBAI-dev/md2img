/**
 * 各平台填表脚本共用的底座：找元素、塞文件、往富文本里写字，以及页面右侧那个可收起的进度抽屉。
 *
 * 平台脚本（content-xhs.ts / content-douyin.ts）只负责「这个平台的表单长什么样、按什么顺序填」，
 * 通用的脏活都在这里——这样新接一个平台只需要写一份选择器和流程。
 */
import { PUBLISH_TARGETS, type FillResult, type FillStep, type PlatformId, type PublishPayload } from '../src/shared/messages';

export const STORAGE_KEY = 'pm.publishPayload';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 轮询等某个选择器出现（按顺序试多个候选，因为平台改版后类名常变） */
export async function waitFor<T extends Element>(
  selectors: string[],
  timeout = 15000,
  predicate: (el: T) => boolean = () => true,
): Promise<T | null> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const found = Array.from(document.querySelectorAll<T>(sel)).find(predicate);
      if (found) return found;
    }
    await sleep(250);
  }
  return null;
}

export const isVisible = (el: Element) => (el as HTMLElement).offsetParent !== null;

/** 按可见文字找元素（CSS 选不了文字，只能自己遍历） */
export function findByText(texts: string[], tags = ['button', 'div', 'span', 'a']): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(tags.join(','));
  for (const text of texts) {
    for (const el of candidates) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (own === text && el.offsetParent !== null) return el;
    }
  }
  return null;
}

/**
 * React 受控组件不认 el.value = x，必须走原生 setter 再派发 input 事件，
 * 否则 React 内部状态不会更新，填进去的字一提交就没了。
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** 往富文本编辑器里写字：execCommand 能让 Quill / ProseMirror / Draft.js 正常收到内容 */
export function typeIntoEditor(el: HTMLElement, text: string) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  document.execCommand('insertText', false, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * 整段替换富文本内容（先全选再 insertText），用于写正文的第一笔。
 * 如果也用追加写法，「重新填写」会在编辑器里再叠一份正文和话题。
 */
export function replaceEditorText(el: HTMLElement, text: string) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  document.execCommand('insertText', false, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 页面是不是已经在填写表单那一步了（说明图片之前传过） */
export function alreadyOnEditForm(titleSelectors: string[]): boolean {
  return titleSelectors.some((sel) => Array.from(document.querySelectorAll(sel)).some(isVisible));
}

export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

/** 把文件塞进 input[type=file]：构造 DataTransfer 再派发 change */
export function injectFiles(input: HTMLInputElement, files: File[]) {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * 打完 #话题 之后，等下拉候选出现再点第一项——只有从下拉里选中的才算真话题，纯文本 # 平台不认。
 *
 * 以前是固定等 1 秒再找一次，网络稍慢下拉还没出来就判定失败了；改成轮询，最多等 timeout。
 */
export async function pickFirstSuggestion(selectors: string[], timeout = 3500): Promise<boolean> {
  const option = await waitFor<HTMLElement>(selectors, timeout, isVisible);
  if (!option) return false;
  option.click();
  await sleep(350);
  return true;
}

/* ---------------- 页面右侧的进度抽屉 ---------------- */

type RunState = 'running' | 'done' | 'failed';

const COLLAPSE_KEY = 'textpic:drawer-collapsed';

const DRAWER_CSS = `
:host { all: initial; }
.wrap {
  position: fixed; top: 96px; right: 0; z-index: 2147483647;
  display: flex; align-items: flex-start;
  font: 13px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #222;
  /* 可继承属性全部显式写死：宿主页面用 * {… !important} 这类规则时会先命中宿主元素，
     再顺着继承链渗进 Shadow DOM，:host { all: initial } 压不住外部的 !important */
  letter-spacing: normal; word-spacing: normal; text-transform: none; text-indent: 0;
  text-align: left; font-style: normal; font-weight: 400; white-space: normal; direction: ltr;
  transition: transform .22s ease;
}
.wrap * { letter-spacing: inherit; }
/* 收起时整块往右推出屏幕，只把左边的把手留在页面边缘 */
.wrap.collapsed { transform: translateX(300px); }
.handle {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  width: 30px; padding: 12px 0; margin-top: 18px;
  background: #fff; border: 1px solid #e6e6e6; border-right: 0; border-radius: 10px 0 0 10px;
  box-shadow: -6px 6px 20px rgba(0,0,0,.10);
  cursor: pointer; user-select: none; color: #444;
}
.handle:hover { color: #ff2e4d; }
.handle-text { writing-mode: vertical-rl; letter-spacing: 2px; font-size: 12px; }
.handle-arrow { font-size: 12px; line-height: 1; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #f59f00; }
.dot.done { background: #18a058; }
.dot.failed { background: #e03131; }
.dot.running { animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .35; } }
.panel {
  width: 300px; max-height: calc(100vh - 140px); overflow: auto; box-sizing: border-box;
  background: #fff; border: 1px solid #e6e6e6; border-right: 0;
  box-shadow: -10px 10px 40px rgba(0,0,0,.14);
  padding: 14px 16px 12px;
}
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.head b { font-size: 13px; }
.status { font-size: 12px; color: #888; margin-bottom: 8px; }
.step { display: flex; gap: 8px; padding: 3px 0; }
.mark-ok { color: #18a058; }
.mark-bad { color: #e03131; }
.detail { display: block; color: #999; font-size: 12px; word-break: break-all; }
.foot { display: flex; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #f0f0f0; }
button.btn {
  font: inherit; font-size: 12px; padding: 5px 12px; border-radius: 8px; cursor: pointer;
  border: 1px solid #e6e6e6; background: #fff; color: #333;
}
button.btn:hover:not(:disabled) { border-color: #ff2e4d; color: #ff2e4d; }
button.btn:disabled { opacity: .5; cursor: default; }
.icon { border: 0; background: none; color: #999; cursor: pointer; font-size: 16px; padding: 0 4px; line-height: 1; }
.icon:hover { color: #333; }
`;

interface Drawer {
  start(): void;
  mark(name: string, ok: boolean, detail?: string): void;
  finish(ok: boolean, message: string): void;
  readonly steps: FillStep[];
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
  } catch {
    /* 某些页面禁用了存储，收起状态记不住也不影响使用 */
  }
}

/**
 * 进度抽屉：贴在页面右边缘，可以收起成一个竖向把手，再点又弹出来。
 *
 * - 放在 Shadow DOM 里：创作平台自己的全局 CSS 很重，直接插普通 div 会被改得面目全非
 * - 收起状态记在该网站的 localStorage：收起一次，下次再填表也保持收起，不会每次都挡住表单
 * - 收起时把手上的小圆点仍显示进度（黄=进行中 / 绿=完成 / 红=有步骤失败），不用展开也知道结果
 * - 以前那个框只能点 × 关掉，关了就再也看不到是哪一步出错
 */
function createDrawer(platformName: string, onRerun: () => void): Drawer {
  const steps: FillStep[] = [];
  let state: RunState = 'running';
  let message = '';
  let collapsed = readCollapsed();

  // 用自定义标签而不是 div：平台页面里常有 div { … } 这种宽泛规则，
  // 自定义标签不会被命中；再用内联 !important 把宿主自身的样式清零——
  // 内联的 !important 优先级高于样式表里的 !important，外部规则改不动它
  const host = document.createElement('textpic-drawer');
  host.style.cssText = 'all: initial !important; display: block !important; position: static !important;';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = DRAWER_CSS;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  root.append(style, wrap);
  document.documentElement.appendChild(host);

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text; // 一律 textContent，标题等用户内容不进 innerHTML
    return node;
  };

  const render = () => {
    wrap.classList.toggle('collapsed', collapsed);
    wrap.replaceChildren();

    const handle = el('div', 'handle');
    handle.title = collapsed ? '展开填表进度' : '收起到页面边缘';
    // 箭头单独放一个横排 span：放进竖排文字里会被转 90 度，看起来像个向下的尖括号
    handle.append(el('span', `dot ${state}`), el('span', 'handle-text', '文图'), el('span', 'handle-arrow', collapsed ? '‹' : '›'));
    handle.addEventListener('click', () => {
      collapsed = !collapsed;
      writeCollapsed(collapsed);
      render();
    });

    const panel = el('div', 'panel');
    const head = el('div', 'head');
    head.append(el('b', undefined, `文图 · ${platformName}填表`));
    const collapseBtn = el('button', 'icon', '›');
    collapseBtn.title = '收起';
    collapseBtn.addEventListener('click', () => {
      collapsed = true;
      writeCollapsed(true);
      render();
    });
    head.append(collapseBtn);
    panel.append(head);

    const statusText =
      state === 'running' ? '正在填写…' : state === 'done' ? message || '已填好，核对后自己点发布' : message || '有步骤没成功';
    panel.append(el('div', 'status', statusText));

    for (const s of steps) {
      const row = el('div', 'step');
      row.append(el('span', s.ok ? 'mark-ok' : 'mark-bad', s.ok ? '✓' : '✕'));
      const body = el('span');
      body.append(document.createTextNode(s.name));
      if (s.detail) body.append(el('span', 'detail', s.detail));
      row.append(body);
      panel.append(row);
    }

    const foot = el('div', 'foot');
    const rerun = el('button', 'btn', '重新填写');
    rerun.disabled = state === 'running';
    rerun.addEventListener('click', onRerun);
    foot.append(rerun);
    panel.append(foot);

    wrap.append(handle, panel);
  };

  render();

  return {
    steps,
    start() {
      steps.length = 0;
      state = 'running';
      message = '';
      render();
    },
    mark(name, ok, detail) {
      steps.push({ name, ok, detail });
      render();
    },
    finish(ok, msg) {
      state = ok && steps.every((s) => s.ok) ? 'done' : 'failed';
      message = msg;
      render();
    },
  };
}

/* ---------------- 平台脚本的注册入口 ---------------- */

export interface FillContext {
  payload: PublishPayload;
  mark: (name: string, ok: boolean, detail?: string) => void;
}

/**
 * 平台脚本调用这个注册自己的填表流程。负责：接 background 发来的指令、读待发布内容、
 * 管理抽屉、防止同一页面并发跑两遍、兜住异常。
 */
export function registerFiller(platform: PlatformId, fill: (ctx: FillContext) => Promise<{ ok: boolean; message: string }>) {
  const target = PUBLISH_TARGETS[platform];
  let drawer: Drawer | null = null;
  let running: Promise<FillResult> | null = null;

  const run = (): Promise<FillResult> => {
    if (running) return running; // 正在填就别再叠一遍，重复注入图片会传两份
    drawer ??= createDrawer(target.name, () => void run());
    const d = drawer;
    d.start();

    running = (async () => {
      try {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        const payload = stored[STORAGE_KEY] as PublishPayload | undefined;
        if (!payload?.images?.length) {
          d.mark('读取图片数据', false, '还没在文图里生成图片');
          d.finish(false, '没有待发布的图片');
          return { ok: false, message: '没有待发布的图片', steps: [...d.steps] };
        }
        if (payload.platform && payload.platform !== platform) {
          d.mark('核对目标平台', false, `这份内容是发往${PUBLISH_TARGETS[payload.platform].name}的`);
          d.finish(false, '平台不匹配');
          return { ok: false, message: '平台不匹配', steps: [...d.steps] };
        }
        d.mark('读取图片数据', true, `${payload.images.length} 张`);

        const result = await fill({ payload, mark: d.mark });
        d.finish(result.ok, result.message);
        return { ...result, steps: [...d.steps] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        d.mark('执行出错', false, msg);
        d.finish(false, msg);
        return { ok: false, message: msg, steps: [...d.steps] };
      } finally {
        running = null;
      }
    })();
    return running;
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'TEXTPIC_FILL' || message.platform !== platform) return false;
    void run().then(sendResponse);
    return true; // 异步回复
  });
}
