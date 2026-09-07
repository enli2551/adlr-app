import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Dumbbell, MessageSquare, TrendingUp, Palette, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import Logo from '@/components/Logo';
import ThemeSwitcher from '@/components/ThemeSwitcher';

const TABS = [
  { to: '/trainer', label: 'Übersicht', icon: LayoutDashboard, end: true },
  { to: '/trainer/plan-builder', label: 'Plan Builder', icon: Dumbbell, end: false },
  { to: '/trainer/nachrichten', label: 'Nachrichten', icon: MessageSquare, end: false },
  { to: '/trainer/business', label: 'Business', icon: TrendingUp, end: false },
];

export default function TrainerLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto">
      <header className="sticky top-0 z-20 bg-adlr-black/80 backdrop-blur-md safe-top">
        <div className="flex items-center justify-between px-5 py-3">
          <button onClick={() => nav('/trainer')} className="flex items-center">
            <Logo size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-medium text-white/80">{profile?.first_name ?? 'Peter'}</p>
              <p className="text-[10px] text-adlr-gold/70">Trainer</p>
            </div>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="w-9 h-9 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold text-xs font-bold adlr-tap"
                aria-label="Konto-Menü"
              >
                {(profile?.first_name?.[0] ?? 'P').toUpperCase()}
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-64 adlr-card p-3 z-40 adlr-fade-in" style={{ background: 'rgb(var(--adlr-anthracite))' }}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <Palette size={15} className="text-adlr-gold" />
                    <p className="text-xs font-medium uppercase tracking-wider text-white/50">Erscheinungsbild</p>
                  </div>
                  <ThemeSwitcher />
                  <button
                    onClick={() => { setMenuOpen(false); signOut(); nav('/trainer-auth'); }}
                    className="adlr-tap w-full flex items-center gap-2 mt-3 pt-3 border-t border-white/10 text-sm text-white/60 hover:text-white/90 px-1"
                  >
                    <LogOut size={15} /> Abmelden
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 pb-28 pt-2">
        <div key={location.pathname} className="adlr-route">{children}</div>
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-adlr-anthracite/95 backdrop-blur-xl border-t border-white/5 safe-bottom z-30">
        <div className="flex justify-around items-center py-2">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-1.5 py-1.5 rounded-lg transition-all ${isActive ? 'text-adlr-gold' : 'text-white/40'}`
              }
            >
              <t.icon size={18} strokeWidth={1.8} />
              <span className="text-[9px] font-medium">{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
