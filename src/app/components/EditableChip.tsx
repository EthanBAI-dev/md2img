import { useEffect, useRef, useState } from 'react';

/** 铅笔图标。用内联 SVG 而不是 emoji：emoji 在不同系统里字形和基线差别太大，对不齐 */
function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false">
      <path
        d="M11.5 1.9a1.4 1.4 0 0 1 2 2l-.7.7-2-2 .7-.7ZM10 3.3l2 2-6.4 6.4-2.6.6.6-2.6L10 3.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

interface Props {
  value: string;
  placeholder?: string;
  maxLength?: number;
  /** 标题那组是单选的，选中的高亮 */
  active?: boolean;
  /** 标签前面那个 # */
  prefix?: string;
  onSelect?: () => void;
  onChange: (next: string) => void;
  onRemove?: () => void;
}

/**
 * 可就地编辑的气泡。
 *
 * 之前标题和标签都是「气泡列表 + 下面再挂一个输入框和按钮」——同一份数据两套控件，
 * 既占地方又要在两处之间来回看。这里合成一个：平时是气泡，鼠标移上去露出铅笔，
 * 点铅笔或双击气泡就地变成输入框，回车/失焦提交，Esc 撤销。
 */
export function EditableChip({ value, placeholder, maxLength, active, prefix, onSelect, onChange, onRemove }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // 进入编辑就全选，直接打字即可覆盖——改标题多半是整句重写，不是补字
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== value) onChange(next);
  };

  if (editing) {
    return (
      <span className="chip chip--editing" data-value={draft || placeholder || ''}>
        <input
          ref={inputRef}
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={placeholder ?? '编辑'}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(value);
              setEditing(false);
            }
          }}
        />
      </span>
    );
  }

  return (
    <span className={`chip${active ? ' is-active' : ''}`}>
      <button
        type="button"
        className="chip-text"
        onClick={onSelect}
        onDoubleClick={() => setEditing(true)}
        title={onSelect ? '点击选用，双击编辑' : '双击编辑'}
      >
        {prefix}
        {value || <span className="chip-placeholder">{placeholder}</span>}
      </button>
      <button type="button" className="chip-edit" aria-label="编辑" title="编辑" onClick={() => setEditing(true)}>
        <PencilIcon />
      </button>
      {onRemove && (
        <button type="button" className="chip-remove" aria-label="删除" title="删除" onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}

interface AddProps {
  label: string;
  placeholder: string;
  maxLength?: number;
  disabled?: boolean;
  onAdd: (value: string) => void;
}

/** 虚线「＋」气泡：点一下就地变成输入框，不用在别处另开一个输入行 */
export function AddChip({ label, placeholder, maxLength, disabled, onAdd }: AddProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = (keepOpen: boolean) => {
    const next = draft.trim();
    setDraft('');
    if (next) onAdd(next);
    // 回车连续加：提交后留在输入态，可以一口气敲好几个标签
    setEditing(keepOpen && !!next);
  };

  if (editing) {
    return (
      <span className="chip chip--editing" data-value={draft || placeholder}>
        <input
          ref={inputRef}
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(true);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setDraft('');
              setEditing(false);
            }
          }}
        />
      </span>
    );
  }

  return (
    <button type="button" className="chip chip--add" disabled={disabled} onClick={() => setEditing(true)}>
      ＋ {label}
    </button>
  );
}
