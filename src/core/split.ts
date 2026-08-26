import type { Block } from './types';
import { md, stripHtml } from './markdown';

/** 在 HTML 字符串中找出「标签外」的句末标点位置 */
function sentenceBoundaries(html: string): number[] {
  const stops = new Set(['。', '！', '？', '；', '…', '!', '?', ';', '.']);
  const out: number[] = [];
  let depth = 0;
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (ch === '<') depth++;
    else if (ch === '>') depth = Math.max(0, depth - 1);
    else if (depth === 0 && stops.has(ch)) {
      // 英文句点要求后面跟空白，避免切在小数点和 e.g. 上
      if ((ch === '.' || ch === '!' || ch === '?' || ch === ';') && !/\s|$/.test(html[i + 1] ?? '')) {
        continue;
      }
      // 吃掉紧随其后的引号、括号
      let end = i + 1;
      while (end < html.length && /["'”’）)】」』]/.test(html[end])) end++;
      out.push(end);
    }
  }
  return out;
}

/** 补全被截断的标签：统计未闭合的标签并按逆序补上 */
function balanceTags(fragment: string): { head: string; tail: string; reopen: string } {
  const stack: string[] = [];
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  const voidTags = new Set(['br', 'img', 'hr', 'input', 'wbr']);
  const opens: string[] = [];

  while ((m = tagRe.exec(fragment)) !== null) {
    const [, closing, name, attrs, selfClose] = m;
    if (voidTags.has(name.toLowerCase()) || selfClose) continue;
    if (closing) {
      const idx = stack.lastIndexOf(name);
      if (idx >= 0) {
        stack.splice(idx, 1);
        opens.splice(idx, 1);
      }
    } else {
      stack.push(name);
      opens.push(`<${name}${attrs}>`);
    }
  }

  const tail = stack
    .slice()
    .reverse()
    .map((n) => `</${n}>`)
    .join('');
  return { head: '', tail, reopen: opens.join('') };
}

/** 按句子把一个段落切成 n 份（尽量等长） */
export function splitParagraph(block: Block, parts: number): Block[] {
  const inner = /^<p[^>]*>([\s\S]*)<\/p>\s*$/.exec(block.html.trim());
  const html = inner ? inner[1] : block.html;
  const bounds = sentenceBoundaries(html);
  if (bounds.length < 1) return [block];

  const target = html.length / parts;
  const cuts: number[] = [];
  let next = target;
  for (const b of bounds) {
    if (b >= next && b < html.length) {
      cuts.push(b);
      next = b + target;
      if (cuts.length >= parts - 1) break;
    }
  }
  if (!cuts.length) return [block];

  const pieces: string[] = [];
  let start = 0;
  let carry = '';
  for (const cut of [...cuts, html.length]) {
    const raw = html.slice(start, cut);
    const { tail, reopen } = balanceTags(carry + raw);
    pieces.push(`<p>${carry}${raw}${tail}</p>`);
    carry = reopen;
    start = cut;
  }

  return pieces
    .filter((p) => stripHtml(p).length > 0)
    .map((h) => ({ ...block, html: h, text: stripHtml(h) }));
}

function chunk<T>(items: T[], parts: number): T[][] {
  const size = Math.ceil(items.length / parts);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.filter((c) => c.length > 0);
}

/** 按 li 切分列表，有序列表用 start 属性接上编号 */
export function splitList(block: Block, parts: number): Block[] {
  const doc = new DOMParser().parseFromString(block.html, 'text/html');
  const list = doc.body.firstElementChild;
  if (!list || !/^(UL|OL)$/.test(list.tagName)) return [block];

  const items = Array.from(list.children).filter((el) => el.tagName === 'LI');
  if (items.length < 2) return [block];

  const groups = chunk(items, parts);
  if (groups.length < 2) return [block];

  const ordered = list.tagName === 'OL';
  let counter = Number(list.getAttribute('start') ?? 1);

  return groups.map((group) => {
    const startAttr = ordered ? ` start="${counter}"` : '';
    counter += group.length;
    const tag = ordered ? 'ol' : 'ul';
    const html = `<${tag}${startAttr}>${group.map((li) => li.outerHTML).join('')}</${tag}>`;
    return { ...block, html, text: stripHtml(html) };
  });
}

/** 按行切分代码块，用原始文本重新走一遍高亮，避免截断跨行的高亮 span */
export function splitCode(block: Block, parts: number): Block[] {
  const lines = block.text.replace(/\n$/, '').split('\n');
  if (lines.length < 2) return [block];

  const langMatch = /class="hljs language-([\w-]+)"/.exec(block.html);
  const lang = langMatch ? langMatch[1] : '';
  const groups = chunk(lines, parts);
  if (groups.length < 2) return [block];

  return groups.map((group) => {
    const source = group.join('\n');
    const html = md.render(`\`\`\`${lang}\n${source}\n\`\`\``);
    return { ...block, html, text: source };
  });
}

/** 按行切分表格，每一份都带上表头 */
export function splitTable(block: Block, parts: number): Block[] {
  const doc = new DOMParser().parseFromString(block.html, 'text/html');
  const table = doc.querySelector('table');
  const tbody = table?.querySelector('tbody');
  if (!table || !tbody) return [block];

  const rows = Array.from(tbody.rows);
  if (rows.length < 2) return [block];

  const thead = table.querySelector('thead')?.outerHTML ?? '';
  const groups = chunk(rows, parts);
  if (groups.length < 2) return [block];

  return groups.map((group) => {
    const html = `<table>${thead}<tbody>${group.map((r) => r.outerHTML).join('')}</tbody></table>`;
    return { ...block, html, text: stripHtml(html) };
  });
}

/** 按块类型分派切分策略；切不动就原样返回 */
export function splitBlock(block: Block, parts: number): Block[] {
  const n = Math.max(2, Math.ceil(parts));
  switch (block.kind) {
    case 'paragraph':
      return splitParagraph(block, n);
    case 'list':
      return splitList(block, n);
    case 'code':
      return splitCode(block, n);
    case 'table':
      return splitTable(block, n);
    case 'quote': {
      // 引用块：拆出内部段落，每段包一层新的 blockquote
      const doc = new DOMParser().parseFromString(block.html, 'text/html');
      const paras = Array.from(doc.querySelectorAll('blockquote > p'));
      if (paras.length < 2) return [block];
      return chunk(paras, n).map((group) => {
        const html = `<blockquote>${group.map((p) => p.outerHTML).join('')}</blockquote>`;
        return { ...block, html, text: stripHtml(html) };
      });
    }
    default:
      // 公式、图片、标题没法切，只能整块占一页
      return [block];
  }
}
