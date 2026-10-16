import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, Dumbbell, MessageSquare, TrendingUp } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { t } from '@/lib/i18n';

type Item = { to: string; label: string; icon: typeof Users; isActive: (path: string, search: URLSearchParams) => boolean };

const ITEMS: Item[] = [
  { to: '/trainer', label: 'Übersicht', icon: LayoutDashboard, isActive: (p) => p === '/trainer' },
  { to: '/trainer/klienten', label: 'Klienten', icon: Users, isActive: (p, s) => p === '/trainer/klienten' && s.get('view') !== 'kalender' },
  { to: '/trainer/klienten?view=kalender', label: 'Kalender', icon: Calendar, isActive: (p, s) => p === '/trainer/klienten' && s.get('view') === 'kalender' },
  { to: '/trainer/plan-builder', label: 'Plan Builder', icon: Dumbbell, isActive: (p) => p.startsWith('/trainer/plan-builder') },
  { to: '/trainer/nachrichten', label: 'Nachrichten', icon: MessageSquare, isActive: (p) => p.startsWith('/trainer/nachrichten') },
  { to: '/trainer/business', label: 'Business', icon: TrendingUp, isActive: (p) => p.startsWith('/trainer/business') },
];

/** Desktop (lg+) navigation for the trainer side. Mobile keeps the bottom tab bar. */
export default function TrainerSidebar({ msgUnread }: { msgUnread: boolean }) {
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  return (
    <aside
      className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-60 flex-col border-r border-white/5 bg-adlr-anthracite"
      aria-label={t('Hauptnavigation')}
    >
      <Link to="/trainer" className="flex items-center px-6 h-16 shrink-0">
        <BrandLogo size={20} />
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {ITEMS.map((item) => {
          const active = item.isActive(pathname, params);
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={active
                ? { background: 'rgb(var(--adlr-gold) / 0.12)', color: 'rgb(var(--adlr-gold))' }
                : { color: 'rgb(var(--text) / 0.6)' }}
              aria-current={active ? 'page' : undefined}
            >
              <span className="relative">
                <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                {item.to === '/trainer/nachrichten' && msgUnread && (
                  <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-adlr-gold" style={{ border: '1.5px solid rgb(var(--adlr-anthracite))' }} />
                )}
              </span>
              {t(item.label)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
