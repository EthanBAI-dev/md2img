import { THEMES } from '../../core/themes';

interface Props {
  themeId: string;
  onSelect: (themeId: string) => void;
}

/**
 * 方框式模板选择器：色块 + 名称，三列网格。
 * 下方预览窗口已经能看到每套模板的真实效果，这里只需要一眼区分色调。
 */
export function ThemePicker({ themeId, onSelect }: Props) {
  return (
    <div className="theme-grid">
      {THEMES.map((theme) => (
        <button
          key={theme.id}
          type="button"
          title={theme.desc}
          aria-pressed={themeId === theme.id}
          className={`theme-box${themeId === theme.id ? ' is-active' : ''}`}
          onClick={() => onSelect(theme.id)}
        >
          <span
            className="theme-swatch"
            style={{ background: `linear-gradient(135deg, ${theme.swatch[0]} 50%, ${theme.swatch[1]} 50%)` }}
          />
          <span className="theme-name">{theme.name}</span>
        </button>
      ))}
    </div>
  );
}
