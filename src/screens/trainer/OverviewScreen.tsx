import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile, UpsellRequest } from '@/lib/types';
import { SectionHeader, Loading } from '@/components/ui';
import { useNavigate } from 'react-router-dom';
import { Bell, Users, TrendingUp, MessageCircle, ClipboardX, Moon, Target, BatteryLow, ChevronRight, CheckCircle2, Trophy, UserPlus } from 'lucide-react';
import BottomSheet from '@/components/BottomSheet';
import WeeklyMessagesCard from '@/components/WeeklyMessagesCard';
import ChallengeCard from '@/components/ChallengeCard';
import MasterAssignCard from '@/components/MasterAssignCard';
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
  const [sheet, setSheet] = useState<null | 'weekly' | 'challenge' | 'new'>(null);
  const [weeklyMissing, setWeeklyMissing] = useState(0);

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
      const active = clientList.filter((c) => c.intake_completed);
      if (active.length) {
        const monday = new Date(weekStart);
        const { data: wm } = await supabase.from('weekly_messages').select('client_id, created_at').in('client_id', active.map((c) => c.id)).gte('created_at', monday.toISOString());
        const fresh = new Set(((wm ?? []) as { client_id: string }[]).map((m) => m.client_id));
        setWeeklyMissing(active.filter((c) => !fresh.has(c.id)).length);
      }

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
  const todoCount = attention.length + (weeklyMissing > 0 ? 1 : 0) + (upsells.length > 0 ? 1 : 0) + (newClients.some((c) => !c.intake_completed) ? 1 : 0);

  return (
    <div className="adlr-fade-in">
      <SectionHeader title={t('Übersicht')} subtitle={(profile?.first_name ? t('Willkommen zurück, {name}.', { name: profile.first_name }) : t('Willkommen zurück.'))} />
      {/* Three numbers, tappable */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <Kpi value={clients.length} label={t('Klienten')} onClick={() => nav('/trainer/klienten')} accent />
        <Kpi value={trainingsThisWeek} label={t('Trainings · Woche')} onClick={() => nav('/trainer/klienten')} />
        <Kpi value={sessionsThisWeek} label={t('Termine · Woche')} onClick={() => nav('/trainer/klienten?view=kalender')} />
      </div>

      {/* Master trainer: sign-ups without an invite code */}
      {profile?.is_master && <MasterAssignCard />}

      {/* To do — only what needs the coach; empty = one calm line */}
      <div className="adlr-card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] uppercase tracking-wider text-white/40">{t('Zu erledigen')}</p>
          {todoCount > 0 && <span className="text-xs font-bold text-adlr-gold">{todoCount}</span>}
        </div>
        {todoCount === 0 ? (
          <p className="text-sm text-white/55 flex items-center gap-2 py-1"><CheckCircle2 size={16} className="text-emerald-400" /> {t('Alles erledigt — deine Klienten sind auf Kurs.')}</p>
        ) : (
          <div>
            {(showAllAttention ? attention : attention.slice(0, 4)).map((a, i) => {
              const Icon = ATTENTION_ICON[a.kind];
              return (
                <TodoRow key={i} icon={Icon} strong={a.severity >= 45} text={a.text}
                  onClick={() => nav(a.kind === 'message' ? `/trainer/nachrichten?client=${a.client.id}` : `/trainer/klienten?client=${a.client.id}`)} />
              );
            })}
            {attention.length > 4 && (
              <button onClick={() => setShowAllAttention(!showAllAttention)} className="adlr-tap w-full py-2 text-xs font-medium text-adlr-gold">
                {showAllAttention ? t('Weniger anzeigen') : t('Alle {n} anzeigen', { n: attention.length })}
              </button>
            )}
            {weeklyMissing > 0 && (
              <TodoRow icon={MessageCircle} text={t('{n} Klienten ohne persönliche Wochen-Nachricht', { n: weeklyMissing })} onClick={() => setSheet('weekly')} />
            )}
            {upsells.length > 0 && (
              <TodoRow icon={TrendingUp} strong text={t('{n} offene Extra-Anfragen', { n: upsells.length })} onClick={() => nav('/trainer/business')} />
            )}
            {newClients.filter((c) => !c.intake_completed).length > 0 && (
              <TodoRow icon={Users} text={t('{n} neue Klienten im Onboarding', { n: newClients.filter((c) => !c.intake_completed).length })} onClick={() => setSheet('new')} />
            )}
          </div>
        )}
      </div>

      {/* Less urgent: one tap away */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button onClick={() => setSheet('challenge')} className="adlr-tap adlr-card p-3.5 text-left">
          <Trophy size={17} className="text-adlr-gold mb-2" />
          <p className="text-sm font-semibold text-white leading-tight">{t('Monats-Challenge')}</p>
          <p className="text-[11px] text-white/40 mt-0.5 truncate">{fmtDate(new Date(), { month: 'long' })}</p>
        </button>
        <button onClick={() => setSheet('new')} className="adlr-tap adlr-card p-3.5 text-left">
          <UserPlus size={17} className="text-adlr-gold mb-2" />
          <p className="text-sm font-semibold text-white leading-tight">{t('Neue Klienten')}</p>
          <p className="text-[11px] text-white/40 mt-0.5 truncate">{newClients.length ? t('{n} in 14 Tagen', { n: newClients.length }) : t('keine in 14 Tagen')}</p>
        </button>
      </div>

      {sheet === 'weekly' && <BottomSheet title={t('Wochen-Nachrichten')} onClose={() => setSheet(null)}><WeeklyMessagesCard clients={clients} /></BottomSheet>}
      {sheet === 'challenge' && <BottomSheet title={t('Monats-Challenge')} onClose={() => setSheet(null)}><ChallengeCard mode="trainer" /></BottomSheet>}
      {sheet === 'new' && (
        <BottomSheet title={t('Neue Klienten')} onClose={() => setSheet(null)}>
          {newClients.length === 0 ? <p className="text-sm text-white/45 text-center py-8">{t('Keine neuen Klienten in den letzten 14 Tagen.')}</p> : (
            <div className="space-y-1.5 pb-2">
              {newClients.map((c) => {
                const days = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
                return (
                  <button key={c.id} onClick={() => nav(`/trainer/klienten?client=${c.id}`)} className="adlr-tap w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left" style={{ background: 'rgb(var(--text) / 0.04)' }}>
                    <div className="w-8 h-8 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold text-xs font-bold overflow-hidden shrink-0">
                      {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : (c.first_name?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/85 truncate">{c.first_name} {c.last_name}</p>
                      <p className="text-xs text-white/40">{days === 0 ? t('heute') : days === 1 ? t('gestern') : t('vor {n} Tagen', { n: days })} · {c.intake_completed ? t('Onboarding abgeschlossen') : t('Onboarding offen')}</p>
                    </div>
                    <ChevronRight size={14} className="text-white/25 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </BottomSheet>
      )}
    </div>
  );
}

function Kpi({ value, label, onClick, accent }: { value: number; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick} className="adlr-tap rounded-2xl px-3 py-3 text-left" style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.06)' }}>
      <p className="text-2xl font-bold leading-none" style={{ color: accent ? 'rgb(var(--adlr-gold))' : 'rgb(var(--text) / 0.92)' }}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-white/40 mt-1.5 truncate">{label}</p>
    </button>
  );
}

function TodoRow({ icon: Icon, text, onClick, strong }: { icon: typeof Bell; text: string; onClick: () => void; strong?: boolean }) {
  return (
    <button onClick={onClick} className="adlr-tap w-full flex items-center gap-2.5 py-2.5 text-left" style={{ borderTop: '1px solid rgb(var(--text) / 0.05)' }}>
      <Icon size={15} className={strong ? 'text-adlr-gold shrink-0' : 'text-white/45 shrink-0'} />
      <span className="text-sm text-white/80 flex-1 min-w-0">{text}</span>
      <ChevronRight size={14} className="text-white/25 shrink-0" />
    </button>
  );
}
