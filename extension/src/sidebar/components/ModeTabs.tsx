import { MODE_REGISTRY } from '../modes/shared/modeRegistry';

interface ModeTabsProps {
  activeId: string;
  onChange: (id: string) => void;
}

export function ModeTabs({ activeId, onChange }: ModeTabsProps) {
  return (
    <div className="notesnap-mode-tabs">
      {MODE_REGISTRY.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={`notesnap-mode-tab ${mode.id === activeId ? 'notesnap-mode-tab--active' : ''}`}
          onClick={() => onChange(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
