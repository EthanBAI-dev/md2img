import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/common';
import { collectMathErrors, mathPlugin, normalizeMathDelimiters, type MathError } from './math';
import type { Block, Note } from './types';

function escapeCode(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function highlightCode(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {
      /* 语言解析失败就退回纯文本 */
    }
  }
  return escapeCode(code);
}

const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: false, // 图片里的链接点不了，转成蓝色反而碍眼
  breaks: true, // 中文写作习惯：单个换行就断行
  typographer: false,
  highlight: highlightCode,
}).use(mathPlugin);

/** 让代码块带上 hljs 类名，样式才吃得到主题变量 */
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const lang = token.info.trim().split(/\s+/)[0] || '';
  const highlighted = highlightCode(token.content, lang);
  return `<pre class="pm-code"><code class="hljs${lang ? ` language-${lang}` : ''}">${highlighted}</code></pre>\n`;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** 极简 frontmatter 解析：只认 key: value 和 key: [a, b] / 逗号分隔，够用且不引额外依赖 */
function parseFrontmatter(src: string): { data: Record<string, string>; body: string } {
  const m = FRONTMATTER_RE.exec(src);
  if (!m) return { data: {}, body: src };

  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    let value = kv[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[kv[1].toLowerCase()] = value;
  }
  return { data, body: src.slice(m[0].length) };
}

/**
 * 在已有 frontmatter 基础上写入/覆盖指定字段，其余字段原样保留，没有 frontmatter 就新建一个。
 * 用于 AI 生成封面标题/副标题/分类标签后，直接回写到笔记源文本里，
 * 这样用户不用自己手写 YAML，写完还能在文本框里接着改。
 */
export function upsertFrontmatter(source: string, updates: Record<string, string>): string {
  const { data, body } = parseFrontmatter(source);
  const merged: Record<string, string> = { ...data, ...updates };

  // 固定一个易读的字段顺序，其余未知字段追加在后面，不丢用户自己写的东西
  const order = ['title', 'subtitle', 'badge', 'author', 'tags', 'theme'];
  const keys = [
    ...order.filter((k) => k in merged),
    ...Object.keys(merged).filter((k) => !order.includes(k)),
  ];

  const lines = keys.filter((k) => merged[k]).map((k) => `${k}: ${merged[k]}`);
  const trimmedBody = body.replace(/^\s+/, '');
  return `---\n${lines.join('\n')}\n---\n\n${trimmedBody}`;
}

/**
 * 拆出原始的 frontmatter 文本块（含 --- 包裹，原样保留）和正文。
 * 用于「AI 排版」这类只重排正文、不动 frontmatter 的场景。
 */
export function splitFrontmatterRaw(source: string): { front: string; body: string } {
  const m = FRONTMATTER_RE.exec(source);
  return m ? { front: m[0], body: source.slice(m[0].length) } : { front: '', body: source };
}

function splitTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/^\[|\]$/g, '')
    .split(/[,，]/)
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean);
}

/** 去掉 HTML 标签取纯文本，用于封面提取和 AI 输入 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 解析笔记：frontmatter 优先，缺什么就从正文里推断。
 * 标题取第一个 H1（并从正文中移除，避免封面和内容页重复）。
 */
export function parseNote(source: string): Note {
  const { data, body: rawBody } = parseFrontmatter(source);
  let body = normalizeMathDelimiters(rawBody);

  let title = data.title ?? '';
  if (!title) {
    const h1 = /^#\s+(.+)$/m.exec(body);
    if (h1) {
      title = h1[1].trim();
      // 只移除作为标题用的那个 H1，正文里剩下的 H1 当普通标题渲染
      body = body.slice(0, h1.index) + body.slice(h1.index + h1[0].length);
    }
  }

  let subtitle = data.subtitle ?? data.desc ?? data.description ?? '';
  if (!subtitle) {
    // 拿正文第一段非空、非标题、非列表的文字当副标题
    const firstPara = body
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .find((s) => s && !/^[#>\-*+`|]/.test(s) && !s.startsWith('$$'));
    if (firstPara) subtitle = stripHtml(md.renderInline(firstPara)).slice(0, 48);
  }

  return {
    title: title || '未命名笔记',
    subtitle: subtitle || undefined,
    badge: data.badge || data.category || undefined,
    author: data.author || undefined,
    tags: splitTags(data.tags),
    theme: data.theme || undefined,
    body: body.trim(),
  };
}

function kindOf(type: string, tag: string): Block['kind'] {
  switch (type) {
    case 'heading_open':
      return 'heading';
    case 'paragraph_open':
      return 'paragraph';
    case 'bullet_list_open':
    case 'ordered_list_open':
      return 'list';
    case 'fence':
    case 'code_block':
      return 'code';
    case 'blockquote_open':
      return 'quote';
    case 'math_block':
      return 'math';
    case 'table_open':
      return 'table';
    case 'hr':
      return 'hr';
    default:
      return tag === 'p' ? 'paragraph' : 'other';
  }
}

const PAGE_BREAK_RE = /^<!--\s*(page|pagebreak|分页)\s*-->$/i;

export interface ParseBlocksResult {
  blocks: Block[];
  /** 渲染过程中遇到的公式错误，用于在构建阶段提示用户，而不是让用户导出后才在图上发现 */
  mathErrors: MathError[];
}

/**
 * 把 markdown 切成顶层块，每块单独渲染成 HTML。
 * 做法是沿 token 流走，用 nesting 计数找出配平的顶层区间，
 * 再把这段 token 交给 renderer —— 这样所有插件规则都还生效。
 */
export function parseBlocks(markdown: string): ParseBlocksResult {
  const { result: blocks, errors: mathErrors } = collectMathErrors(() => parseBlocksInner(markdown));
  return { blocks, mathErrors };
}

function parseBlocksInner(markdown: string): Block[] {
  const env = {};
  const tokens = md.parse(markdown, env);
  const blocks: Block[] = [];
  let pendingBreak = false;

  let i = 0;
  while (i < tokens.length) {
    const start = i;
    let depth = 0;
    do {
      depth += tokens[i].nesting;
      i++;
    } while (i < tokens.length && depth !== 0);

    const slice = tokens.slice(start, i);
    const head = slice[0];

    // 显式分页标记：<!-- page -->
    if (head.type === 'html_block' && PAGE_BREAK_RE.test(head.content.trim())) {
      pendingBreak = true;
      continue;
    }
    // 分隔线也当强制分页用（和 marp / slidev 的习惯一致）
    if (head.type === 'hr') {
      pendingBreak = true;
      continue;
    }

    const html = md.renderer.render(slice, md.options, env);
    if (!html.trim()) continue;

    const block: Block = {
      type: head.type,
      kind: kindOf(head.type, head.tag),
      html,
      text: head.type === 'fence' || head.type === 'code_block' ? head.content : stripHtml(html),
    };
    if (head.type === 'heading_open') block.level = Number(head.tag.slice(1)) || 2;
    if (pendingBreak) {
      block.pageBreak = true;
      pendingBreak = false;
    }
    blocks.push(block);
  }

  return blocks;
}

export interface MaskedImages {
  /** 图片地址被换成短占位符之后的文本，可以安全发给模型 */
  masked: string;
  /** 把模型返回的文本里的占位符换回真实地址 */
  restore(text: string): string;
}

/** 超过这个长度的图片地址才值得替换；短的相对路径留着还能给模型一点上下文 */
const LONG_SRC = 120;
const TOKEN = /pm-img-\d+/g;

/**
 * 发给 AI 之前，把图片地址换成 `pm-img-1` 这样的短占位符。
 *
 * 图片内联成 data URL 之后，一张 SVG 就是几万字符的 base64。实测一篇带图笔记，
 * 「AI 排版」「AI 去味」发出去的前 6000 字里 97% 是 base64——模型几乎看不到正文，
 * 改写质量直接崩掉，token 也全浪费在无意义的字符上。
 *
 * 只动地址、不动 alt 和图片在文中的位置，模型照常能看到「这里有张图」。
 */
export function maskImageSources(markdown: string): MaskedImages {
  const store = new Map<string, string>();
  let seq = 0;
  const swap = (src: string): string => {
    if (src.length <= LONG_SRC) return src;
    seq += 1;
    const key = `pm-img-${seq}`;
    store.set(key, src);
    return key;
  };

  let masked = markdown.replace(
    /(<img\b[^>]*?\bsrc=)(["'])(.*?)\2/gi,
    (_m, head: string, q: string, src: string) => `${head}${q}${swap(src)}${q}`,
  );
  masked = masked.replace(
    /(!\[[^\]]*\]\()([^)\s]+)(\))/g,
    (_m, head: string, src: string, tail: string) => `${head}${swap(src)}${tail}`,
  );

  return {
    masked,
    // 模型漏掉某个占位符时就地留着原样，总比把整张图丢了强
    restore: (text) => text.replace(TOKEN, (key) => store.get(key) ?? key),
  };
}

export { md };
