import type { RefObject } from 'react';

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  onInsertImage: () => void;
}

interface ToolButton {
  label: string;
  title: string;
  onClick: () => void;
  className?: string;
}

/**
 * 编辑器工具栏：参考成熟 Markdown 编辑器（Madopic 等）的常见操作集合——
 * 加粗/斜体/删除线包住选区，标题/引用/列表在行首插前缀，链接/表格/分页给个模板。
 * 每个按钮点完都把光标或新选区停在刚插入的占位文字上，可以直接接着打字覆盖。
 */
export function MarkdownToolbar({ textareaRef, value, onChange, onInsertImage }: Props) {
  const focusAndSelect = (start: number, end: number) => {
    const el = textareaRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, end);
    });
  };

  /** 用 before/after 包住选区；没选中就插入占位文字，并把占位文字选中方便直接改 */
  const wrap = (before: string, after: string, placeholder: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const inner = value.slice(start, end) || placeholder;
    onChange(value.slice(0, start) + before + inner + after + value.slice(end));
    focusAndSelect(start + before.length, start + before.length + inner.length);
  };

  /** 在光标所在行的行首插入前缀，用于标题/引用/列表这类块级标记 */
  const linePrefix = (prefix: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    onChange(value.slice(0, lineStart) + prefix + value.slice(lineStart));
    focusAndSelect(start + prefix.length, start + prefix.length);
  };

  /** 插入一段独占若干行的内容（表格模板、分页线），自动补前面缺的换行 */
  const insertBlock = (text: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const needsLeadingBreak = start > 0 && value[start - 1] !== '\n';
    const block = (needsLeadingBreak ? '\n' : '') + text;
    onChange(value.slice(0, start) + block + value.slice(end));
    const pos = start + block.length;
    focusAndSelect(pos, pos);
  };

  const groups: ToolButton[][] = [
    [
      { label: 'B', title: '粗体', onClick: () => wrap('**', '**', '粗体文字'), className: 'md-tb--bold' },
      { label: 'I', title: '斜体', onClick: () => wrap('*', '*', '斜体文字'), className: 'md-tb--italic' },
      { label: 'S', title: '删除线', onClick: () => wrap('~~', '~~', '删除线文字'), className: 'md-tb--strike' },
    ],
    [
      { label: 'H', title: '标题', onClick: () => linePrefix('## ') },
      { label: '"', title: '引用', onClick: () => linePrefix('> ') },
      { label: '{ }', title: '行内代码', onClick: () => wrap('`', '`', 'code') },
    ],
    [
      { label: '•', title: '无序列表', onClick: () => linePrefix('- ') },
      { label: '1.', title: '有序列表', onClick: () => linePrefix('1. ') },
    ],
    [
      { label: '链接', title: '插入链接', onClick: () => wrap('[', '](https://)', '链接文字') },
      { label: '图片', title: '插入图片', onClick: onInsertImage },
      { label: '表格', title: '插入表格', onClick: () => insertBlock('\n| 列1 | 列2 |\n| --- | --- |\n| 内容 | 内容 |\n') },
    ],
    [{ label: '分页', title: '插入分页线（--- 会强制从这里另起一张卡片）', onClick: () => insertBlock('\n---\n') }],
  ];

  return (
    <div className="md-toolbar">
      {groups.map((group, i) => (
        <div className="md-toolbar-group" key={i}>
          {group.map((btn) => (
            <button
              key={btn.label}
              type="button"
              className={`md-toolbar-btn ${btn.className ?? ''}`}
              title={btn.title}
              onClick={btn.onClick}
            >
              {btn.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
