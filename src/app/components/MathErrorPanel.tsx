import { useState } from 'react';
import type { MathError } from '../../core/math';

interface Props {
  errors: MathError[];
  /** 返回 false 表示没能在原文里找到这处公式，调用方会提示手动替换 */
  onFix: (error: MathError) => Promise<boolean>;
}

function ErrorRow({ error, onFix }: { error: MathError; onFix: Props['onFix'] }) {
  const [state, setState] = useState<'idle' | 'fixing' | 'failed'>('idle');

  const fix = async () => {
    setState('fixing');
    const ok = await onFix(error);
    setState(ok ? 'idle' : 'failed');
  };

  return (
    <li className="math-error-item">
      <code className="math-error-tex">{error.tex.trim().slice(0, 60)}</code>
      <span className="math-error-msg">{error.message}</span>
      <button type="button" className="btn btn--ghost btn--xs" disabled={state === 'fixing'} onClick={fix}>
        {state === 'fixing' ? '修复中…' : 'AI 修复'}
      </button>
      {state === 'failed' && <span className="math-error-fail">没找到原文位置，手动改一下</span>}
    </li>
  );
}

/** 公式报错清单：图片里那个刺眼的红框，在导出前先在这里看到并修掉 */
export function MathErrorPanel({ errors, onFix }: Props) {
  if (!errors.length) return null;
  return (
    <div className="alert alert--error math-error-panel">
      <p className="math-error-title">
        {errors.length} 处公式格式有误，图片里会显示成红色报错框：
      </p>
      <ul className="math-error-list">
        {errors.map((err, i) => (
          <ErrorRow key={i} error={err} onFix={onFix} />
        ))}
      </ul>
    </div>
  );
}
