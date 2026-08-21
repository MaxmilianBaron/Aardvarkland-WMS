import { pickLanguage } from '../../core/i18n/i18n';
import { useMemo, useState } from 'react';
import { getNavigationForMode, RouteKey } from '../../app/navigation';
import { useWorkspace } from '../../core/workspace/workspace';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (route: RouteKey) => void;
}

export function CommandPalette({ open, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const { can, language, roleProfile, workspaceMode } = useWorkspace();
  const commandCopy = pickLanguage(language, { cs: { open: 'Otevřít', role: 'Moje role', dialog: 'Vyhledávání v systému', placeholder: 'Hledat v systému...', input: 'Hledat v systému' }, en: { open: 'Open', role: 'My role', dialog: 'System search', placeholder: 'Search the system...', input: 'Search the system' }, ua: { open: 'Відкрити', role: 'Моя роль', dialog: 'Пошук у системі', placeholder: 'Шукати в системі...', input: 'Шукати в системі' } });
  const commands = useMemo(() => {
    const routeCommands = getNavigationForMode(workspaceMode, language)
      .filter((item) => can(item.permission))
      .map((item) => ({ label: `${commandCopy.open} ${item.label}`, meta: item.eyebrow, action: () => onNavigate(item.key) }));
    const base = [
      { label: `${commandCopy.role}: ${roleProfile.label}`, meta: roleProfile.description, action: () => onNavigate(roleProfile.homeRoute) },
      ...routeCommands,
    ];
    const q = query.trim().toLowerCase();
    return q ? base.filter((item) => `${item.label} ${item.meta}`.toLowerCase().includes(q)).slice(0, 8) : base.slice(0, 8);
  }, [query, onNavigate, can, language, roleProfile, workspaceMode, commandCopy.open, commandCopy.role]);

  if (!open) return null;

  return (
    <div className="command-backdrop" onMouseDown={onClose} role="presentation">
      <section
        className="command"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={commandCopy.dialog}
      >
        <div className="command__input">
          <span aria-hidden="true">⌕</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={commandCopy.placeholder}
            aria-label={commandCopy.input}
          />
          <button type="button" onClick={onClose}>Esc</button>
        </div>
        <div className="command__list">
          {commands.map((command, index) => (
            <button
              key={`${command.label}-${index}`}
              type="button"
              onClick={() => {
                command.action();
                onClose();
              }}
            >
              <span>{command.label}</span>
              <small>{command.meta}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
