import { useEffect, useState } from 'react';
import { Trophy, Pencil, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { t, fmtDate } from '@/lib/i18n';
import {
  loadChallenge, monthKey, challengeTitle, fmtMetric, METRIC_LABEL,
  type Challenge, type BoardRow, type ChallengeMetric,
} from '@/lib/engagement';

const METRICS: ChallengeMetric[] = ['workouts', 'minutes', 'volume'];
const GOAL_HINT: Record<ChallengeMetric, string> = { workouts: '12', minutes: '600', volume: '50000' };
const MEDAL = ['🥇', '🥈', '🥉'];

/** Monthly challenge of the coach's group. Client: own progress, rank, opt-in. Trainer: set it up + full ranking. */
export default function ChallengeCard({ mode }: { mode: 'client' | 'trainer' }) {
  const { profile, refreshProfile } = useAuth();
  const coachId = mode === 'trainer' ? profile?.id : profile?.trainer_id;
  const [data, setData] = useState<{ challenge: Challenge; board: BoardRow[]; available: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ metric: ChallengeMetric; goal: string; title: string }>({ metric: 'workouts', goal: '12', title: '' });
  const [optBusy, setOptBusy] = useState(false);

  const load = () => loadChallenge(coachId).then(setData);
  useEffect(() => { load(); }, [coachId]);

  if (!data || !data.available || !profile) return null;
  const { challenge, board } = data;
  const me = board.find((r) => r.is_me);
  const optedIn = !!profile.leaderboard_opt_in;
  const ranked = board.filter((r) => mode === 'trainer' || r.opted_in);
  const myRank = me && optedIn ? ranked.findIndex((r) => r.is_me) + 1 : null;
  const pct = me ? Math.min(100, (me.value / challenge.goal) * 100) : 0;
  const daysLeft = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate() - n.getDate(); })();

  const save = async () => {
    const goal = Number(form.goal.replace(',', '.'));
    if (!(goal > 0)) return;
    await supabase.from('monthly_challenges').upsert(
      { trainer_id: profile.id, month: monthKey(), metric: form.metric, goal, title: form.title.trim() || null },
      { onConflict: 'trainer_id,month' },
    );
    setEditing(false);
    load();
  };

  const toggleOpt = async () => {
    setOptBusy(true);
    await supabase.from('profiles').update({ leaderboard_opt_in: !optedIn }).eq('id', profile.id);
    await refreshProfile();
    await load();
    setOptBusy(false);
  };

  return (
    <div className="adlr-card p-5 mb-5" style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold) / 0.10), rgb(var(--adlr-gold) / 0.02))' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-adlr-gold flex items-center gap-1.5"><Trophy size={12} /> {t('Monats-Challenge')} · {fmtDate(new Date(), { month: 'long' })}</p>
          <p className="text-base font-bold text-white mt-1">{challengeTitle(challenge)}</p>
          <p className="text-[11px] text-white/40 mt-0.5">{daysLeft === 0 ? t('Letzter Tag!') : t('Noch {n} Tage', { n: daysLeft })}</p>
        </div>
        {mode === 'trainer' && !editing && (
          <button onClick={() => { setForm({ metric: challenge.metric, goal: String(challenge.goal), title: challenge.title ?? '' }); setEditing(true); }}
            aria-label={t('Bearbeiten')} className="adlr-tap p-1.5 text-white/40"><Pencil size={15} /></button>
        )}
      </div>

      {editing && (
        <div className="rounded-xl p-3 mb-3 space-y-2" style={{ background: 'rgb(var(--text) / 0.04)' }}>
          <div className="flex gap-1.5">
            {METRICS.map((m) => (
              <button key={m} onClick={() => setForm({ ...form, metric: m, goal: GOAL_HINT[m] })}
                className="adlr-tap flex-1 py-1.5 rounded-lg text-xs font-medium border"
                style={form.metric === m ? { background: 'rgb(var(--adlr-gold))', color: '#000', borderColor: 'rgb(var(--adlr-gold))' } : { color: 'rgb(var(--text) / 0.6)', borderColor: 'rgb(var(--text) / 0.12)' }}>
                {t(METRIC_LABEL[m])}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[10px] uppercase text-white/40">{t('Ziel')}{form.metric === 'volume' ? ' (kg)' : form.metric === 'minutes' ? ' (min)' : ''}
              <input inputMode="numeric" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}
                className="mt-1 w-full bg-inset border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none" />
            </label>
            <label className="col-span-2 text-[10px] uppercase text-white/40">{t('Titel (optional)')}
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('z.B. Oktober-Offensive')}
                className="mt-1 w-full bg-inset border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none placeholder-white/25" />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="adlr-tap flex-1 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>{t('Speichern')}</button>
            <button onClick={() => setEditing(false)} className="adlr-tap px-4 py-2 rounded-xl text-sm bg-white/5 text-white/60">{t('Abbrechen')}</button>
          </div>
        </div>
      )}

      {mode === 'client' && me && (
        <div className="mb-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <p className="text-sm text-white/80">{t('Du')}: <span className="font-bold text-white">{fmtMetric(challenge.metric, me.value)}</span> / {fmtMetric(challenge.metric, challenge.goal)}</p>
            {myRank ? <p className="text-xs font-semibold text-adlr-gold">{t('Platz {r} von {n}', { r: myRank, n: ranked.length })}</p> : null}
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-adlr-gold transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          {pct >= 100 && <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1"><Check size={12} /> {t('Ziel erreicht — stark!')}</p>}
        </div>
      )}

      {ranked.length > 0 && (mode === 'trainer' || optedIn) && (
        <div className="space-y-1">
          {ranked.slice(0, mode === 'trainer' ? 50 : 10).map((r, i) => (
            <div key={r.client_id} className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 ${r.is_me ? 'bg-adlr-gold/10' : ''}`}>
              <span className="w-6 text-center text-sm">{MEDAL[i] ?? <span className="text-xs text-white/40">{i + 1}</span>}</span>
              <span className={`flex-1 text-sm truncate ${r.is_me ? 'text-adlr-gold font-semibold' : 'text-white/80'}`}>{r.display_name}{mode === 'trainer' && !r.opted_in ? <span className="text-white/30 text-[10px]"> · {t('privat')}</span> : null}</span>
              <span className="text-sm font-semibold text-white tabular-nums">{fmtMetric(challenge.metric, r.value)}</span>
            </div>
          ))}
        </div>
      )}

      {mode === 'client' && (
        <button onClick={toggleOpt} disabled={optBusy} className="adlr-tap w-full mt-3 pt-3 text-left text-xs flex items-center justify-between disabled:opacity-50" style={{ borderTop: '1px solid rgb(var(--text) / 0.07)' }}>
          <span className="text-white/55">{optedIn ? t('Du erscheinst im Ranking (Vorname + Initiale).') : t('Mach mit beim Ranking deiner Trainingsgruppe — nur Vorname + Initiale.')}</span>
          <span className="text-adlr-gold font-semibold shrink-0 ml-3">{optedIn ? t('Austreten') : t('Mitmachen')}</span>
        </button>
      )}
      {mode === 'trainer' && ranked.length === 0 && <p className="text-xs text-white/40">{t('Noch keine Klienten.')}</p>}
    </div>
  );
}
