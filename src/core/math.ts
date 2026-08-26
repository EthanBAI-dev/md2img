import katex from 'katex';
import type MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

/**
 * 把 LaTeX 常见的 \(...\) / \[...\] 定界符归一化成 $...$ / $$...$$。
 * 大模型生成的笔记大量使用这两种写法，而 markdown 生态基本只认 $。
 *
 * 反斜杠个数按 1~2 个匹配（\\{1,2}），不是只认单个：
 * ChatGPT 等很多模型默认用 \\( ... \\) / \\[ ... \\] 双反斜杠写法输出行内/块级公式，
 * 这是相当常见的约定。如果只匹配单反斜杠，正则会在双反斜杠中间错位断开
 * （把第二个反斜杠当成定界符的一部分，第一个反斜杠留在外面），
 * 留下的那个孤立反斜杠会在后面被 markdown 的转义规则吃掉、变成一个普通的转义 $，
 * 公式就直接沦为纯文本，连红色报错框都不会出现——比"识别出来但报错"还隐蔽。
 * 跳过围栏代码块和行内代码，避免误伤代码里的反斜杠。
 */
export function normalizeMathDelimiters(src: string): string {
  const segments: string[] = [];
  const fence = /^(\s*)(```+|~~~+)[\s\S]*?^\1\2\s*$/gm;
  let last = 0;
  let m: RegExpExecArray | null;

  const convert = (text: string) =>
    text
      // \\[ ... \\] 或 \[ ... \] → $$ ... $$（块级，允许跨行）
      .replace(/\\{1,2}\[([\s\S]+?)\\{1,2}\]/g, (_, body) => `\n$$\n${String(body).trim()}\n$$\n`)
      // \\( ... \\) 或 \( ... \) → $ ... $（行内，不跨行）
      .replace(/\\{1,2}\(([^\n]+?)\\{1,2}\)/g, (_, body) => `$${String(body).trim()}$`);

  // 保留围栏代码块原样，其余部分做替换
  while ((m = fence.exec(src)) !== null) {
    segments.push(convert(src.slice(last, m.index)));
    segments.push(m[0]);
    last = m.index + m[0].length;
  }
  segments.push(convert(src.slice(last)));
  return segments.join('');
}

export interface MathError {
  /** 定界符里的原始 LaTeX（不含 $ / $$） */
  tex: string;
  /** 块级公式（$$）还是行内公式（$） */
  displayMode: boolean;
  /** KaTeX 的报错信息，通常会指出具体哪个记号有问题 */
  message: string;
}

/**
 * 公式出错时页面上早就有一个红框能看到（.pm-math-error），
 * 但那只在肉眼扫过那一页才会发现——用户经常是导出以后才注意到某张图里有个刺眼的报错框。
 * 用一个模块级的收集器，把渲染过程中遇到的错误也旁路记录一份，
 * 供 parseBlocks 在构建阶段就汇总成一条明确的警告。
 */
let errorSink: MathError[] | null = null;

/** 在 fn 执行期间收集所有公式渲染错误，返回结果和错误列表 */
export function collectMathErrors<T>(fn: () => T): { result: T; errors: MathError[] } {
  const prev = errorSink;
  const errors: MathError[] = [];
  errorSink = errors;
  try {
    return { result: fn(), errors };
  } finally {
    errorSink = prev;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 一种能在原文里定位到某处公式的候选写法：用哪种定界符、对应的匹配正则 */
export interface FormulaLocator {
  pattern: RegExp;
  /** 修复后重新拼回原文时要用同一种定界符，不然会把用户 \(...\) 的写法悄悄换成 $...$ */
  wrap: (fixedTex: string) => string;
}

/**
 * 给一处公式的原始 LaTeX 建一组能在笔记源文本里定位它的候选正则，按命中概率从高到低排列。
 *
 * 这里必须试多种定界符：MathError.tex 来自 parseNote 处理过的 note.body，
 * 而 \(...\) / \[...\] 早在 normalizeMathDelimiters 里就被转成了 $.../$$...$$ ——
 * 如果用户原文写的是 \(...\)，只按 $ 去原始 markdown 里找永远找不到。
 * 排在最后的是宽松兜底：只锚定开头结尾，容忍中间在换行/trim 上的细微差异。
 */
export function buildFormulaLocators(tex: string, displayMode: boolean): FormulaLocator[] {
  const trimmed = tex.trim();
  const exact = trimmed.split(/\s+/).map(escapeRegExp).join('\\s+');
  // 1~2 个反斜杠都算：兼容标准的 \(...\) 写法，也兼容大模型常用的 \\(...\\) 双反斜杠写法。
  // 用 String.raw 拼，是纯粹的正则片段字符串，不用再去心算两层转义
  const bs = String.raw`\\{1,2}`;
  const locators: FormulaLocator[] = displayMode
    ? [
        { pattern: new RegExp(`\\$\\$\\s*${exact}\\s*\\$\\$`), wrap: (t) => `$$\n${t}\n$$` },
        { pattern: new RegExp(`${bs}\\[\\s*${exact}\\s*${bs}\\]`), wrap: (t) => `\\[${t}\\]` },
      ]
    : [
        { pattern: new RegExp(`\\$${exact}\\$`), wrap: (t) => `$${t}$` },
        { pattern: new RegExp(`${bs}\\(\\s*${exact}\\s*${bs}\\)`), wrap: (t) => `\\(${t}\\)` },
      ];

  if (trimmed.length > 24) {
    const head = escapeRegExp(trimmed.slice(0, 12));
    const tail = escapeRegExp(trimmed.slice(-12));
    if (displayMode) {
      locators.push(
        { pattern: new RegExp(`\\$\\$[\\s\\S]{0,6}${head}[\\s\\S]*?${tail}[\\s\\S]{0,6}\\$\\$`), wrap: (t) => `$$\n${t}\n$$` },
        { pattern: new RegExp(`${bs}\\[[\\s\\S]{0,6}${head}[\\s\\S]*?${tail}[\\s\\S]{0,6}${bs}\\]`), wrap: (t) => `\\[${t}\\]` },
      );
    } else {
      locators.push(
        { pattern: new RegExp(`\\$${head}[\\s\\S]*?${tail}\\$`), wrap: (t) => `$${t}$` },
        { pattern: new RegExp(`${bs}\\(${head}[\\s\\S]*?${tail}${bs}\\)`), wrap: (t) => `\\(${t}\\)` },
      );
    }
  }

  return locators;
}

function renderTex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      // 故意设成 true：false 的话 KaTeX 会把解析错误吞掉，自己用红色文字画出错误提示、
      // 但不抛异常——这样下面的 catch 永远走不到，构建阶段也就没法收集到这处错误。
      // 设 true 让它抛出来，统一走我们自己的错误展示（.pm-math-error）和收集逻辑。
      throwOnError: true,
      strict: false,
      // 只输出 HTML：MathML 那份在截图时是冗余的，还会干扰 html-to-image 的尺寸测量
      output: 'html',
      trust: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errorSink?.push({ tex, displayMode, message: msg });
    return `<span class="pm-math-error" title="${escapeAttr(msg)}">${escapeHtml(tex)}</span>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

/** 行内公式：$...$ */
function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  if (src[state.pos] !== '$') return false;
  // 前面是反斜杠 → 转义的美元符号，不当公式
  if (state.pos > 0 && src[state.pos - 1] === '\\') return false;
  // $$ 交给块级规则处理
  if (src[state.pos + 1] === '$') return false;

  const start = state.pos + 1;
  // 开定界符后紧跟空白 → 多半是「$ 100」这种货币写法
  if (start >= src.length || /\s/.test(src[start])) return false;

  let pos = start;
  let end = -1;
  while (pos < src.length) {
    const ch = src[pos];
    if (ch === '\n') break; // 行内公式不跨行
    if (ch === '$' && src[pos - 1] !== '\\') {
      end = pos;
      break;
    }
    pos++;
  }
  if (end < 0) return false;

  const content = src.slice(start, end);
  if (!content.trim()) return false;
  // 闭定界符前是空白，或紧跟数字（「5$ 和 10$」）→ 不当公式
  if (/\s$/.test(content)) return false;
  if (/^\d/.test(src[end + 1] ?? '')) return false;

  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.markup = '$';
    token.content = content;
  }
  state.pos = end + 1;
  return true;
}

/** 块级公式：独占一行的 $$...$$ */
function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const begin = state.bMarks[startLine] + state.tShift[startLine];
  const lineMax = state.eMarks[startLine];
  if (begin + 2 > lineMax) return false;
  if (state.src.slice(begin, begin + 2) !== '$$') return false;
  if (silent) return true;

  const lines: string[] = [];
  let firstLine = state.src.slice(begin + 2, lineMax);
  let found = false;

  if (firstLine.trim().endsWith('$$')) {
    // 单行形式：$$ x^2 $$
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }
  if (firstLine.trim()) lines.push(firstLine);

  let nextLine = startLine;
  while (!found) {
    nextLine++;
    if (nextLine >= endLine) break;
    const s = state.bMarks[nextLine] + state.tShift[nextLine];
    const e = state.eMarks[nextLine];
    const line = state.src.slice(s, e);
    if (line.trim().endsWith('$$')) {
      const rest = line.trim().slice(0, -2);
      if (rest.trim()) lines.push(rest);
      found = true;
      break;
    }
    lines.push(line);
  }

  state.line = found ? nextLine + 1 : nextLine;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = lines.join('\n').trim();
  token.map = [startLine, state.line];
  token.markup = '$$';
  return true;
}

/** markdown-it 公式插件 */
export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.after('blockquote', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });

  md.renderer.rules.math_inline = (tokens, idx) =>
    `<span class="pm-math-inline">${renderTex(tokens[idx].content, false)}</span>`;

  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="pm-math-block">${renderTex(tokens[idx].content, true)}</div>\n`;
}
