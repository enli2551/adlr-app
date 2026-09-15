import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { CalendarDays, Dumbbell, Apple, MessageSquare, Gem, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import Logo from '@/components/Logo';

// Coach (messaging) lives in the header as a chat icon — underused, kept out of the bottom bar.
const TABS = [
  { to: '/app', label: 'Training', icon: Dumbbell, end: true },
  { to: '/app/fortschritt', label: 'Fortschritt', icon: CalendarDays, end: false },
  { to: '/app/ernaehrung', label: 'Ernährung', icon: Apple, end: false },
  { to: '/app/profil', label: 'Profil', icon: User, end: false },
  { to: '/app/upgrades', label: 'Upgrades', icon: Gem, end: false },
];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [coachUnread, setCoachUnread] = useState(false);

  // Unread indicator for the Coach chat: any trainer message newer than last-seen.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('messages')
        .select('sent_at')
        .eq('client_id', profile.id)
        .eq('sender', 'trainer')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      let seen = 0;
      try { seen = Number(localStorage.getItem('adlr_coach_seen') || 0); } catch { /* ignore */ }
      if (new Date(data.sent_at).getTime() > seen) setCoachUnread(true);
    })();
    return () => { cancelled = true; };
  }, [profile?.id, location.pathname]);

  // Mark as seen when the Coach screen is opened.
  useEffect(() => {
    if (location.pathname === '/app/coach') {
      try { localStorage.setItem('adlr_coach_seen', String(Date.now())); } catch { /* ignore */ }
      setCoachUnread(false);
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-adlr-black/90 safe-top">
        <div className="flex items-center justify-between px-5 py-3">
          <button onClick={() => nav('/app')} className="flex items-center">
            <Logo size={18} />
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => nav('/app/coach')}
              className="relative w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 adlr-tap"
              aria-label="Coach / Nachrichten"
            >
              <MessageSquare size={17} />
              {coachUnread && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-adlr-gold" style={{ border: '1.5px solid rgb(var(--adlr-black))' }} />
              )}
            </button>
            <div className="text-right">
              <p className="text-xs font-medium text-white/80">{profile?.first_name ?? 'Klient'}</p>
              <p className="text-[10px] text-adlr-gold/70">Klient</p>
            </div>
            <button
              onClick={() => { signOut(); nav('/auth'); }}
              className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 text-xs font-bold adlr-tap"
            >
              {(profile?.first_name?.[0] ?? 'K').toUpperCase()}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 pb-28 pt-2">
        <div key={location.pathname} className="adlr-route">{children}</div>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-adlr-anthracite border-t border-white/5 safe-bottom z-30">
        <div className="flex justify-around items-center py-2">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-all ${isActive ? 'text-adlr-gold' : 'text-white/40'}`
              }
            >
              <t.icon size={20} strokeWidth={1.8} />
              <span className="text-[10px] font-medium">{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
