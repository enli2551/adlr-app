import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Dumbbell, MessageSquare, TrendingUp } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useIncomingMessages } from '@/lib/chat';
import BrandLogo from '@/components/BrandLogo';
import { t } from '@/lib/i18n';
import TrainerAccountSheet from '@/components/TrainerAccountSheet';
import CoachQuestionsEditor from '@/components/CoachQuestionsEditor';

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
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [msgUnread, setMsgUnread] = useState(false);

  // Live: a client message while the app is open lights the Nachrichten dot (RLS limits the stream to my clients).
  useIncomingMessages('client', () => {
    if (window.location.pathname !== '/trainer/nachrichten') setMsgUnread(true);
  }, profile?.id);

  // Unread indicator for Nachrichten: any client message newer than last-seen.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('messages')
        .select('sent_at')
        .eq('sender', 'client')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      let seen = 0;
      try { seen = Number(localStorage.getItem('adlr_msgs_seen') || 0); } catch { /* ignore */ }
      if (new Date(data.sent_at).getTime() > seen) setMsgUnread(true);
    })();
    return () => { cancelled = true; };
  }, [profile?.id, location.pathname]);

  useEffect(() => {
    if (location.pathname === '/trainer/nachrichten') {
      try { localStorage.setItem('adlr_msgs_seen', String(Date.now())); } catch { /* ignore */ }
      setMsgUnread(false);
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto">
      <header className="sticky top-0 z-20 bg-adlr-black safe-top">
        <div className="flex items-center justify-between px-5 py-3">
          <button onClick={() => nav('/trainer')} className="flex items-center">
            <BrandLogo size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-medium text-white/80">{profile?.first_name ?? t('Coach')}</p>
              <p className="text-[10px] text-adlr-gold/70">{t('Trainer')}</p>
            </div>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="w-9 h-9 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold text-xs font-bold adlr-tap"
                aria-label={t('Konto-Menü')}
              >
                {(profile?.first_name?.[0] ?? 'C').toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <TrainerAccountSheet
          onClose={() => setMenuOpen(false)}
          onQuestions={() => { setMenuOpen(false); setQuestionsOpen(true); }}
          onSignOut={async () => { setMenuOpen(false); await signOut(); nav('/trainer-auth', { replace: true }); }}
        />
      )}
      {questionsOpen && <CoachQuestionsEditor onClose={() => setQuestionsOpen(false)} />}
      <main className="flex-1 px-5 pb-28 pt-2">
        <div key={location.pathname} className="adlr-route">{children}</div>
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-adlr-anthracite border-t border-white/5 safe-bottom z-30">
        <div className="flex justify-around items-center py-2">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-1.5 py-1.5 rounded-lg transition-all ${isActive ? 'text-adlr-gold' : 'text-white/40'}`
              }
            >
              <span className="relative">
                <tab.icon size={18} strokeWidth={1.8} />
                {tab.to === '/trainer/nachrichten' && msgUnread && (
                  <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-adlr-gold" style={{ border: '1.5px solid rgb(var(--adlr-anthracite))' }} />
                )}
              </span>
              <span className="text-[9px] font-medium">{t(tab.label)}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
