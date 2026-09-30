import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile, UpsellRequest } from '@/lib/types';
import { SectionHeader, Loading, StatCard, Card } from '@/components/ui';
import { useNavigate } from 'react-router-dom';
import { Bell, Users, Calendar, TrendingUp, AlertTriangle, MessageCircle, ClipboardX, Moon, Target, BatteryLow, ChevronRight } from 'lucide-react';
import { computeAttention, type AttentionItem, type AttentionKind } from '@/lib/attention';
import { t, fmtDate } from '@/lib/i18n';

const ATTENTION_ICON: Record<AttentionKind, typeof Bell> = {
  message: MessageCircle, no_plan: ClipboardX, inactive: Moon, behind: Target, low_checkin: BatteryLow,
};

export default function OverviewScreen() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [clients, setClients] = useState<Profile[]>([]);
  const [upsells, setUpsells] = useState<UpsellRequest[]>([]);
  const [sessionsThisWeek, setSessionsThisWeek] = useState(0);
  const [sessionsThisMonth, setSessionsThisMonth] = useState(0);
  const [trainingsThisWeek, setTrainingsThisWeek] = useState(0);
  const [newClients, setNewClients] = useState<Profile[]>([]);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!profile) return;
      // Monday 00:00 of the current week (getDay() is 0 on Sunday → go back 6 days, not forward 1)
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

      // Clients first — the completion/check-in queries below are scoped to their
      // ids so they never scan every client of every trainer.
      const { data: clientsData } = await supabase
        .from('profiles').select('*').eq('role', 'client').eq('trainer_id', profile.id).order('created_at', { ascending: false });
      const clientList = (clientsData ?? []) as Profile[];
      const clientIds = clientList.map((c) => c.id);

      const [u, s, wc, att] = await Promise.all([
        supabase.from('upsell_requests').select('*, profiles!inner(first_name,last_name)').eq('status', 'pending').eq('profiles.trainer_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('sessions').select('id, scheduled_at').eq('trainer_id', profile.id).neq('status', 'cancelled').gte('scheduled_at', weekStart.toISOString()).lt('scheduled_at', weekEnd.toISOString()),
        clientIds.length > 0
          ? supabase.from('workout_completions').select('completed_at').in('client_id', clientIds).gte('completed_at', (weekStart < monthStart ? weekStart : monthStart).toISOString())
          : Promise.resolve({ data: [] as { completed_at: string }[] }),
        computeAttention(clientList).catch(() => [] as AttentionItem[]),
      ]);
      setAttention(att);

      setClients(clientList);
      setUpsells((u.data ?? []) as UpsellRequest[]);
      setSessionsThisWeek(s.data?.length ?? 0);
      const comps = (wc.data ?? []) as { completed_at: string }[];
      setSessionsThisMonth(comps.filter((c) => new Date(c.completed_at) >= monthStart).length);
      setTrainingsThisWeek(comps.filter((c) => new Date(c.completed_at) >= weekStart).length);
      // Only clients who joined in the last 14 days (the card disappears afterwards)
      const cutoff = Date.now() - 14 * 86400000;
      setNewClients(clientList.filter((c) => new Date(c.created_at).getTime() >= cutoff));
      setLoading(false);
    })();
  }, [profile?.id]);

  if (loading) return <Loading />;

  return (
    <div className="adlr-fade-in">
      <SectionHeader title={t('Übersicht')} subtitle={t('Willkommen zurück, Peter.')} />
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatCard label={t('Aktive Klienten')} value={clients.length} accent />
        <StatCard label={t('Termine diese Woche')} value={sessionsThisWeek} />
        <StatCard label={t('Absolvierte Trainings · diese Woche')} value={trainingsThisWeek} />
        <StatCard label={`${t('Absolvierte Trainings')} · ${fmtDate(new Date(), { month: 'long' })}`} value={sessionsThisMonth} />
      </div>

      {/* Quick access: Klienten + Kalender (moved out of the bottom nav) */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button
          onClick={() => nav('/trainer/klienten')}
          className="adlr-tap flex items-center gap-2.5 rounded-2xl px-4 py-3.5 border transition-all"
          style={{ background: 'rgb(var(--text) / 0.03)', borderColor: 'rgb(var(--text) / 0.07)' }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.12)' }}>
            <Users size={17} className="text-adlr-gold" />
          </div>
          <span className="text-sm font-medium text-white/85">{t('Klienten')}</span>
        </button>
        <button
          onClick={() => nav('/trainer/klienten?view=kalender')}
          className="adlr-tap flex items-center gap-2.5 rounded-2xl px-4 py-3.5 border transition-all"
          style={{ background: 'rgb(var(--text) / 0.03)', borderColor: 'rgb(var(--text) / 0.07)' }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.12)' }}>
            <Calendar size={17} className="text-adlr-gold" />
          </div>
          <span className="text-sm font-medium text-white/85">{t('Kalender')}</span>
        </button>
      </div>

      {/* Needs attention */}
      <Card className="mb-4">
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle size={18} className="text-adlr-gold" />
          <p className="text-sm font-medium text-white/80">{t('Braucht Aufmerksamkeit')}</p>
          <span className="ml-auto text-adlr-gold font-bold">{attention.length}</span>
        </div>
        {attention.length === 0 ? (
          <p className="text-sm text-white/40">{t('Alles im grünen Bereich.')}</p>
        ) : (
          <div className="space-y-1.5">
            {(showAllAttention ? attention : attention.slice(0, 5)).map((a, i) => {
              const Icon = ATTENTION_ICON[a.kind];
              return (
                <button
                  key={i}
                  onClick={() => nav(a.kind === 'message' ? '/trainer/nachrichten' : `/trainer/klienten?client=${a.client.id}`)}
                  className="adlr-tap w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
                  style={{ background: 'rgb(var(--text) / 0.03)' }}
                >
                  <Icon size={15} className={a.severity >= 45 ? 'text-adlr-gold shrink-0' : 'text-white/45 shrink-0'} />
                  <span className="text-sm text-white/80 flex-1 min-w-0">{a.text}</span>
                  <ChevronRight size={14} className="text-white/25 shrink-0" />
                </button>
              );
            })}
            {attention.length > 5 && (
              <button onClick={() => setShowAllAttention(!showAllAttention)} className="adlr-tap w-full pt-1.5 text-xs font-medium text-adlr-gold">
                {showAllAttention ? t('Weniger anzeigen') : t('Alle {n} anzeigen', { n: attention.length })}
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Upsell requests */}
      <Card className="mb-4 adlr-gold-border" onClick={() => nav('/trainer/business')}>
        <div className="flex items-center gap-3 mb-3">
          <TrendingUp size={18} className="text-adlr-gold" />
          <p className="text-sm font-medium text-white/80">{t('Upsell-Anfragen')}</p>
          <span className="ml-auto text-adlr-gold font-bold">{upsells.length}</span>
        </div>
        {upsells.length > 0 ? (
          <div className="space-y-2">
            {upsells.slice(0, 3).map((u) => (
              <div key={u.id} className="flex justify-between items-center text-sm">
                <span className="text-white/70">{t('{name} will {what}', { name: (u as unknown as { profiles: { first_name: string; last_name: string } }).profiles?.first_name ?? '', what: u.upgrade_key })}</span>
                <span className="text-xs text-adlr-gold">{t('Offen')}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-white/40">{t('Keine offenen Anfragen.')}</p>}
      </Card>

      {/* New clients — only those who joined in the last 14 days; hidden otherwise */}
      {newClients.length > 0 && (
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <Users size={18} className="text-adlr-gold" />
            <p className="text-sm font-medium text-white/80">{t('Neue Klienten')}</p>
            <span className="ml-auto text-[11px] text-white/35">{t('letzte 14 Tage')}</span>
          </div>
          <div className="space-y-1.5">
            {newClients.map((c) => {
              const days = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
              return (
                <button
                  key={c.id}
                  onClick={() => nav(`/trainer/klienten?client=${c.id}`)}
                  className="adlr-tap w-full flex items-center gap-3 rounded-xl px-2 py-1.5 text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold text-xs font-bold overflow-hidden shrink-0">
                    {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : (c.first_name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/80 truncate">{c.first_name} {c.last_name}</p>
                    <p className="text-xs text-white/40">
                      {days === 0 ? t('heute') : days === 1 ? t('gestern') : t('vor {n} Tagen', { n: days })} · {c.intake_completed ? t('Onboarding abgeschlossen') : t('Onboarding offen')}
                    </p>
                  </div>
                  {c.intake_completed && <Bell size={14} className="text-adlr-gold shrink-0" />}
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
