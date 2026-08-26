/**
 * 注入到 creator.xiaohongshu.com 的脚本：把侧边栏生成好的图片和文案填进发布表单。
 *
 * 重要：小红书前端会改版，选择器失效是迟早的事。所有选择器集中放在 SELECTORS 里，
 * 页面上有可视化的步骤面板，哪一步红了就改对应那一项即可。
 * 脚本永远不会替你点「发布」，最后一步始终由人确认。
 */

const STORAGE_KEY = 'pm.publishPayload';

const SELECTORS = {
  /** 「上传图文」标签，按文字匹配 */
  imageTabText: ['上传图文', '图文'],
  /** 图片上传的 file input */
  fileInput: ['input[type="file"][accept*="image"]', 'input.upload-input', 'input[type="file"]'],
  /** 标题输入框 */
  titleInput: [
    'input[placeholder*="标题"]',
    '.title-container input',
    '.d-text[placeholder*="标题"]',
    'input[type="text"]',
  ],
  /** 正文富文本编辑器 */
  editor: ['#post-textarea', '.ql-editor', '[contenteditable="true"]'],
  /** 发布按钮，按文字匹配 */
  publishText: ['发布', '发布笔记'],
};

interface Step {
  name: string;
  ok: boolean;
  detail?: string;
}

const steps: Step[] = [];
function mark(name: string, ok: boolean, detail?: string) {
  steps.push({ name, ok, detail });
  renderStatus();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 轮询等待某个选择器出现 */
async function waitFor<T extends Element>(
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

/** 按可见文字找元素（CSS 选不了文字，只能自己遍历） */
function findByText(texts: string[], tags = ['button', 'div', 'span', 'a']): HTMLElement | null {
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
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** 往富文本编辑器里写字：execCommand 能让 Quill / ProseMirror 正常收到内容 */
function typeIntoEditor(el: HTMLElement, text: string) {
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

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

/** 把文件塞进 input[type=file]：构造 DataTransfer 再派发 change */
function injectFiles(input: HTMLInputElement, files: File[]) {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ---------------- 页面上的状态面板 ---------------- */

let panel: HTMLDivElement | null = null;

function renderStatus(title = '文图 TextPIC 正在填表') {
  if (!panel) {
    panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed',
      'right:20px',
      'bottom:20px',
      'z-index:2147483647',
      'width:300px',
      'background:#fff',
      'border:1px solid #e6e6e6',
      'border-radius:12px',
      'box-shadow:0 10px 40px rgba(0,0,0,.16)',
      'padding:14px 16px',
      'font:13px/1.6 -apple-system,"PingFang SC",sans-serif',
      'color:#222',
    ].join(';');
    document.body.appendChild(panel);
  }
  panel.innerHTML =
    `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">` +
    `<b style="font-size:13px">${title}</b>` +
    `<span id="pm-close" style="cursor:pointer;color:#999;padding:0 4px">×</span></div>` +
    steps
      .map(
        (s) =>
          `<div style="display:flex;gap:8px;padding:3px 0">` +
          `<span style="color:${s.ok ? '#18a058' : '#e03131'}">${s.ok ? '✓' : '✕'}</span>` +
          `<span style="flex:1">${s.name}` +
          (s.detail ? `<br><span style="color:#999;font-size:12px">${s.detail}</span>` : '') +
          `</span></div>`,
      )
      .join('');
  panel.querySelector('#pm-close')?.addEventListener('click', () => {
    panel?.remove();
    panel = null;
  });
}

/* ---------------- 主流程 ---------------- */

async function fillPublishForm() {
  steps.length = 0;

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const payload = stored[STORAGE_KEY] as
    | { images: string[]; title: string; body: string; tags: string[] }
    | undefined;

  if (!payload?.images?.length) {
    mark('读取图片数据', false, '侧边栏还没生成图片');
    return { ok: false, message: '没有待发布的图片', steps };
  }
  mark('读取图片数据', true, `${payload.images.length} 张`);

  // 1. 切到「上传图文」
  const imageTab = findByText(SELECTORS.imageTabText);
  if (imageTab) {
    imageTab.click();
    mark('切换到上传图文', true);
    await sleep(900);
  } else {
    mark('切换到上传图文', true, '页面已在图文模式或无需切换');
  }

  // 2. 注入图片
  const input = await waitFor<HTMLInputElement>(SELECTORS.fileInput, 15000);
  if (!input) {
    mark('找到图片上传框', false, '选择器失效，见 content-xhs.ts 的 SELECTORS.fileInput');
    return { ok: false, message: '找不到上传控件', steps };
  }
  const files = payload.images.map((d, i) => dataUrlToFile(d, `${String(i + 1).padStart(2, '0')}.png`));
  injectFiles(input, files);
  mark('上传图片', true, `已投递 ${files.length} 张，等待网站处理`);

  // 3. 等编辑表单出现
  const titleInput = await waitFor<HTMLInputElement>(
    SELECTORS.titleInput,
    30000,
    (el) => el.offsetParent !== null,
  );
  if (!titleInput) {
    mark('等待编辑表单', false, '图片可能还在上传，或标题框选择器失效');
    return { ok: false, message: '没等到编辑表单', steps };
  }
  mark('等待编辑表单', true);

  // 4. 标题
  if (payload.title) {
    setNativeValue(titleInput, payload.title.slice(0, 20));
    mark('填写标题', true, payload.title.slice(0, 20));
  }

  // 5. 正文 + 标签
  const editor = await waitFor<HTMLElement>(SELECTORS.editor, 8000, (el) => el.offsetParent !== null);
  if (!editor) {
    mark('填写正文', false, '找不到正文编辑器，正文请手动粘贴');
  } else {
    if (payload.body) {
      typeIntoEditor(editor, payload.body);
      mark('填写正文', true, `${payload.body.length} 字`);
    }

    if (payload.tags?.length) {
      let linked = 0;
      typeIntoEditor(editor, '\n\n');
      for (const tag of payload.tags) {
        typeIntoEditor(editor, `#${tag}`);
        // 等话题下拉出现，选中第一项才会变成真正的话题（纯文本 # 不算话题）
        await sleep(1000);
        const option = document.querySelector<HTMLElement>(
          '.mention-list .item, .topic-list .item, [class*="mention"] [class*="item"]',
        );
        if (option && option.offsetParent !== null) {
          option.click();
          linked++;
          await sleep(400);
        } else {
          typeIntoEditor(editor, ' ');
        }
      }
      mark(
        '插入话题标签',
        true,
        linked === payload.tags.length
          ? `${linked} 个已关联为话题`
          : `${linked}/${payload.tags.length} 个关联成功，其余是纯文本，可手动重打一遍`,
      );
    }
  }

  // 6. 定位发布按钮但不点，交给人确认
  const publish = findByText(SELECTORS.publishText);
  if (publish) {
    publish.scrollIntoView({ behavior: 'smooth', block: 'center' });
    publish.style.outline = '3px solid #ff2e4d';
    publish.style.outlineOffset = '3px';
    mark('已就绪', true, '检查无误后自己点「发布」');
  } else {
    mark('已就绪', true, '内容已填好，请自行核对后发布');
  }

  renderStatus('文图 TextPIC 填表完成');
  return { ok: true, message: '填写完成', steps };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'TEXTPIC_FILL') return false;
  fillPublishForm()
    .then(sendResponse)
    .catch((err: unknown) => {
      mark('执行出错', false, err instanceof Error ? err.message : String(err));
      sendResponse({ ok: false, message: String(err), steps });
    });
  return true;
});
