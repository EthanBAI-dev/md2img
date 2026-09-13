import { THEMES } from '../../core/themes';

interface Props {
  themeId: string;
  onSelect: (themeId: string) => void;
}

/** 主题说明「米白底 + 暖橘强调，手账感，通用性最好」只取逗号后面的用途部分，放在卡片第二行 */
function shortDesc(desc: string): string {
  const parts = desc.split('，');
  return parts.length > 1 ? parts.slice(1).join('，') : desc;
}

/**
 * 横向小卡片：左边圆形色块，右边名称 + 适用场景，三列网格。
 * 下方预览窗口已经能看到每套模板的真实效果，这里只需要一眼区分色调和用途。
 */
export function ThemePicker({ themeId, onSelect }: Props) {
  return (
    <div className="theme-grid">
      {THEMES.map((theme) => {
        const active = themeId === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            title={theme.desc}
            aria-pressed={active}
            className={`theme-box${active ? ' is-active' : ''}`}
            onClick={() => onSelect(theme.id)}
          >
            <span
              className="theme-swatch"
              style={{ background: `linear-gradient(135deg, ${theme.swatch[0]} 50%, ${theme.swatch[1]} 50%)` }}
            />
            <span className="theme-text">
              <span className="theme-name">{theme.name}</span>
              <span className="theme-desc">{shortDesc(theme.desc)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
