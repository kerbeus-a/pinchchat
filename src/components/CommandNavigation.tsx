import { Database, ListChecks, MessageSquareText, Network } from 'lucide-react';
import type { CommandView } from '../lib/commandView';

const ITEMS: Array<{ view: Exclude<CommandView, 'swarm'>; label: string; icon: typeof MessageSquareText }> = [
  { view: 'chat', label: 'Chat', icon: MessageSquareText },
  { view: 'investigations', label: 'GM Activity', icon: Network },
  { view: 'review', label: 'Review', icon: ListChecks },
  { view: 'sources', label: 'Sources', icon: Database },
];

function NavigationItems({ activeView, onSelect, mobile = false }: {
  activeView: CommandView;
  onSelect: (view: Exclude<CommandView, 'swarm'>) => void;
  mobile?: boolean;
}) {
  return ITEMS.map(({ view, label, icon: Icon }) => {
    const active = activeView === view;
    return (
      <button
        key={view}
        type="button"
        onClick={() => onSelect(view)}
        className={`${mobile ? 'min-w-0 flex-1 py-1' : 'w-full py-2'} flex flex-col items-center justify-center gap-1 text-[10px] transition-colors ${
          active ? 'text-pc-accent-light bg-[var(--pc-accent-glow)]' : 'text-pc-text-muted hover:text-pc-text hover:bg-[var(--pc-hover)]'
        }`}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        title={label}
      >
        <Icon size={mobile ? 18 : 17} strokeWidth={active ? 2.25 : 1.75} />
        <span className="w-full whitespace-nowrap px-1">{label}</span>
      </button>
    );
  });
}

export function CommandNavigation({ activeView, onSelect }: {
  activeView: CommandView;
  onSelect: (view: Exclude<CommandView, 'swarm'>) => void;
}) {
  return (
    <>
      <nav className="hidden lg:flex w-[84px] shrink-0 flex-col border-r border-pc-border bg-[var(--pc-bg-surface)] py-3 gap-1" aria-label="Command center">
        <div className="h-10 flex items-center justify-center mb-2 font-semibold text-sm text-pc-text" aria-label="Kin">KIN</div>
        <NavigationItems activeView={activeView} onSelect={onSelect} />
      </nav>
      <nav className="fixed lg:hidden bottom-0 inset-x-0 z-40 h-14 flex border-t border-pc-border bg-[var(--pc-bg-surface)]" aria-label="Command center">
        <NavigationItems activeView={activeView} onSelect={onSelect} mobile />
      </nav>
    </>
  );
}
