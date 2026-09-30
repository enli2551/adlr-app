import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Target, TrendingDown, TrendingUp, Dumbbell, Flame, Footprints, Moon, HeartPulse, Camera, Sparkles, Check, RefreshCw, Utensils } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabase';
import { t, fmtDate, fmtNum, getLang, LANGS, type Lang } from '@/lib/i18n';
import { Loading } from '@/components/ui';
import SignedPhoto from '@/components/SignedPhoto';
import { computeProgress, statsForAI, type ProgressStats } from '@/lib/progressReport';
import type { Profile } from '@/lib/types';
import { useCoachName } from '@/lib/auth';

const GOLD = 'rgb(var(--adlr-gold))';
const CARD = { background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.08)' };
const MEASURE_LABEL: Record<string, string> = { weight_kg: 'Gewicht', waist_cm: 'Taille', chest_cm: 'Brust', hips_cm: 'Hüfte', arm_cm: 'Arme', thigh_cm: 'Oberschenkel' };

interface ReportRow { id: string; draft: string | null; body: string | null; status: 'draft' | 'approved'; lang: string; created_at: string; approved_at: string | null }

/** The one-line hero headline, chosen by the client's goal. */
function headline(s: ProgressStats): string {
  const cons = s.consistency.weeksTotal > 0 ? t('{hit} von {total} Wochen dein Ziel erreicht', { hit: s.consistency.weeksHit, total: s.consistency.weeksTotal }) : null;
  if (s.focus === 'fatloss') {
    if (s.weight && s.weight.delta <= -0.5) return t('{n} kg leichter seit dem Start', { n: fmtNum(Math.abs(s.weight.delta)) });
    if (s.waist && s.waist.delta <= -1) return t('{n} cm weniger Taille', { n: fmtNum(Math.abs(s.waist.delta)) });
  }
  if (s.focus === 'muscle' && s.strength[0] && s.strength[0].pct >= 1) {
    const g = s.strength[0];
    return t('{pct} % stärker bei {name} in {weeks} Wochen', { pct: g.pct, name: t(g.name), weeks: g.weeks });
  }
  if (cons) return cons;
  if (s.steps.recent) return t('Ø {n} Schritte am Tag', { n: fmtNum(s.steps.recent) });
  return s.totalWorkouts > 0 ? t('{n} Trainings absolviert — jedes einzelne zählt.', { n: s.totalWorkouts }) : t('Deine Reise beginnt jetzt.');
}

/**
 * Goal-driven personal progress report. Client mode shows Peter's approved summary;
 * trainer mode adds the AI draft → edit → approve panel (nothing reaches the client
 * before Peter approves it).
 */
export default function ProgressReport({ client, onClose, trainerMode = false }: { client: Profile; onClose: () => void; trainerMode?: boolean }) {
  const coach = useCoachName();
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [approved, setApproved] = useState<ReportRow | null>(null);
  const [draft, setDraft] = useState<ReportRow | null>(null);
  const [text, setText] = useState('');
  const [lang, setLang] = useState<Lang>(((client.lang as Lang) || (trainerMode ? 'de' : getLang())));
  const [busy, setBusy] = useState<'gen' | 'approve' | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);

  const loadReports = async () => {
    const { data } = await supabase.from('progress_reports').select('id, draft, body, status, lang, created_at, approved_at')
      .eq('client_id', client.id).order('created_at', { ascending: false }).limit(10);
    const rows = (data ?? []) as ReportRow[];
    setApproved(rows.find((r) => r.status === 'approved') ?? null);
    const d = trainerMode ? rows.find((r) => r.status === 'draft') ?? null : null;
    setDraft(d);
    if (d) setText(d.draft ?? '');
  };

  useEffect(() => {
    computeProgress(client).then(setStats).catch(() => setStats(null));
    loadReports();
  }, [client.id]);

  const generate = async () => {
    if (!stats) return;
    setBusy('gen');
    setAiErr(null);
    const { data, error } = await supabase.functions.invoke('coach-report', {
      body: { client_id: client.id, stats: statsForAI(stats), lang, first_name: client.first_name ?? '' },
    });
    setBusy(null);
    if (error || !data?.draft) { setAiErr(t('KI-Entwurf fehlgeschlagen. Ist die Funktion „coach-report“ deployt?')); return; }
    setDraft({ id: data.id, draft: data.draft, body: null, status: 'draft', lang, created_at: new Date().toISOString(), approved_at: null });
    setText(data.draft);
  };

  const approve = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy('approve');
    setAiErr(null);
    const now = new Date().toISOString();
    const res = draft
      ? await supabase.from('progress_reports').update({ body, status: 'approved', approved_at: now }).eq('id', draft.id)
      : await supabase.from('progress_reports').insert({ client_id: client.id, lang, body, status: 'approved', approved_at: now });
    setBusy(null);
    if (res.error) { setAiErr(t('Speichern fehlgeschlagen (Migration ausgeführt?)')); return; }
    setDraft(null);
    setText('');
    loadReports();
  };

  const sections = useMemo(() => {
    if (!stats) return [];
    const order: Record<ProgressStats['focus'], string[]> = {
      fatloss: ['body', 'kcal', 'consistency', 'strength', 'health'],
      muscle: ['strength', 'consistency', 'body', 'health', 'kcal'],
      health: ['consistency', 'health', 'strength', 'body', 'kcal'],
    };
    return order[stats.focus];
  }, [stats]);

  const body = (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'rgb(var(--adlr-black))' }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 safe-top" style={{ background: 'rgb(var(--adlr-black) / 0.92)', borderBottom: '1px solid rgb(var(--text) / 0.06)' }}>
        <button onClick={onClose} className="adlr-tap w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgb(var(--text) / 0.06)' }} aria-label={t('Zurück')}>
          <ArrowLeft size={18} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white truncate">{trainerMode ? t('Fortschrittsbericht · {name}', { name: client.first_name ?? '' }) : t('Dein Fortschritt')}</h1>
      </div>

      {!stats ? <Loading /> : (
        <div className="px-4 pb-16 pt-3 max-w-md mx-auto w-full adlr-fade-in space-y-4">
          {/* Hero */}
          <div className="rounded-3xl p-6 adlr-gold-border" style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold) / 0.16), rgb(var(--adlr-gold) / 0.04))' }}>
            <p className="text-xs uppercase tracking-wider text-adlr-gold/80 flex items-center gap-1.5"><Target size={13} /> {t('Dein Ziel')}: {stats.goal ? t(stats.goal) : t('Allgemein')}</p>
            <p className="text-2xl font-extrabold text-white mt-2 leading-snug">{headline(stats)}</p>
            <p className="text-sm text-white/55 mt-2">
              {stats.weeksSinceStart > 0 ? t('{w} Wochen dabei · {n} Trainings', { w: stats.weeksSinceStart, n: stats.totalWorkouts }) : t('Starte dein erstes Training — dein Bericht wächst mit dir.')}
            </p>
          </div>

          {/* Coach summary (approved) */}
          {approved?.body && (
            <div className="rounded-3xl p-5" style={CARD}>
              <p className="text-xs uppercase tracking-wider text-adlr-gold/80 mb-2 flex items-center gap-1.5"><Sparkles size={13} /> {t('Einschätzung von {coach}', { coach })}</p>
              <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{approved.body}</p>
              {approved.approved_at && <p className="text-[11px] text-white/35 mt-2">{fmtDate(approved.approved_at, { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>}
            </div>
          )}

          {/* Trainer: AI draft → edit → approve */}
          {trainerMode && (
            <div className="rounded-3xl p-5" style={{ ...CARD, borderColor: 'rgb(var(--adlr-gold) / 0.3)' }}>
              <p className="text-sm font-semibold text-white flex items-center gap-2"><Sparkles size={15} className="text-adlr-gold" /> {t('Coach-Zusammenfassung')}</p>
              <p className="text-xs text-white/45 mt-1 mb-3">{t('Die KI schreibt einen Entwurf in deinem Ton. Du bearbeitest ihn und gibst ihn frei — erst dann sieht ihn der Klient.')}</p>
              <div className="flex gap-1.5 mb-3">
                {LANGS.map((l) => (
                  <button key={l.id} onClick={() => setLang(l.id)} className="adlr-tap px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={lang === l.id ? { background: GOLD, color: '#000' } : { background: 'rgb(var(--text) / 0.06)', color: 'rgb(var(--text) / 0.6)' }}>
                    {l.short}
                  </button>
                ))}
              </div>
              <textarea
                rows={7} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={t('Erstelle einen KI-Entwurf oder schreib selbst…')}
                className="w-full bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none resize-none leading-relaxed"
              />
              {aiErr && <p className="text-xs text-red-400 mt-2">{aiErr}</p>}
              <div className="flex gap-2 mt-3">
                <button onClick={generate} disabled={busy !== null} className="adlr-tap flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 bg-white/5 border border-white/10 text-white/80 disabled:opacity-50">
                  <RefreshCw size={14} className={busy === 'gen' ? 'animate-spin' : ''} /> {busy === 'gen' ? t('Schreibt…') : text ? t('Neu erstellen') : t('KI-Entwurf')}
                </button>
                <button onClick={approve} disabled={busy !== null || !text.trim()} className="adlr-tap flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: GOLD, color: '#000' }}>
                  <Check size={15} /> {t('Freigeben')}
                </button>
              </div>
            </div>
          )}

          {sections.map((sec) => {
            if (sec === 'body' && (stats.weight || stats.waist)) {
              const w = stats.weight;
              const down = (w?.delta ?? 0) <= 0;
              return (
                <div key={sec} className="rounded-3xl p-5" style={CARD}>
                  <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2">{down ? <TrendingDown size={16} className="text-adlr-gold" /> : <TrendingUp size={16} className="text-adlr-gold" />} {t('Körper')}</p>
                  {w && (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-white">{fmtNum(w.current)} kg</span>
                        <span className="text-sm font-semibold" style={{ color: stats.focus === 'fatloss' ? (w.delta <= 0 ? '#22c55e' : '#fb923c') : 'rgb(var(--text) / 0.6)' }}>{w.delta > 0 ? '+' : ''}{fmtNum(w.delta)} kg</span>
                      </div>
                      <p className="text-xs text-white/45">{t('Start: {n} kg', { n: fmtNum(w.start) })}</p>
                      {w.points.length >= 3 && (
                        <div className="h-32 mt-3 -ml-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={w.points.map((p) => ({ label: fmtDate(p.date, { day: '2-digit', month: '2-digit' }), v: p.value }))} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
                              <XAxis dataKey="label" tick={{ fill: 'rgb(var(--text) / 0.4)', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={18} />
                              <YAxis tick={{ fill: 'rgb(var(--text) / 0.4)', fontSize: 10 }} axisLine={false} tickLine={false} domain={['dataMin - 1', 'dataMax + 1']} />
                              <Line type="monotone" dataKey="v" stroke={GOLD} strokeWidth={2.5} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </>
                  )}
                  {stats.waist && (
                    <p className="text-sm text-white/75 mt-3">{t('Taille')}: <span className="font-semibold text-white">{fmtNum(stats.waist.current)} cm</span> <span className="text-white/45">({stats.waist.delta > 0 ? '+' : ''}{fmtNum(stats.waist.delta)} cm)</span></p>
                  )}
                </div>
              );
            }
            if (sec === 'kcal' && stats.kcal) {
              return (
                <div key={sec} className="rounded-3xl p-5" style={CARD}>
                  <p className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Utensils size={16} className="text-adlr-gold" /> {t('Kalorienziel')}</p>
                  <p className="text-3xl font-bold text-white">{stats.kcal.adherencePct}%</p>
                  <p className="text-xs text-white/50">{t('der erfassten Tage im Zielbereich (±10 %) · {n} Tage · Ziel {kcal} kcal', { n: stats.kcal.daysLogged, kcal: fmtNum(stats.kcal.target) })}</p>
                </div>
              );
            }
            if (sec === 'consistency' && stats.consistency.weeksTotal > 0) {
              const c = stats.consistency;
              return (
                <div key={sec} className="rounded-3xl p-5" style={CARD}>
                  <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Flame size={16} className="text-adlr-gold" /> {t('Konstanz')}</p>
                  <div className="flex gap-1.5 mb-2">
                    {Array.from({ length: c.weeksTotal }, (_, i) => (
                      <span key={i} className="flex-1 h-2.5 rounded-full" style={{ background: i < c.weeksHit ? GOLD : 'rgb(var(--text) / 0.1)' }} />
                    ))}
                  </div>
                  <p className="text-sm text-white/75">{t('{hit} von {total} Wochen dein Ziel erreicht', { hit: c.weeksHit, total: c.weeksTotal })}</p>
                </div>
              );
            }
            if (sec === 'strength' && stats.strength.length > 0) {
              const top = stats.strength[0];
              return (
                <div key={sec} className="rounded-3xl p-5" style={CARD}>
                  <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Dumbbell size={16} className="text-adlr-gold" /> {t('Kraft · geschätztes 1RM')}</p>
                  <div className="space-y-2.5">
                    {stats.strength.map((g) => (
                      <div key={g.name} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-white/85 min-w-0 truncate">{t(g.name)}</span>
                        <span className="text-sm shrink-0"><span className="text-white/50">{fmtNum(g.from)} → </span><span className="font-bold text-white">{fmtNum(g.to)} kg</span> <span className="font-semibold" style={{ color: g.pct > 0 ? '#22c55e' : 'rgb(var(--text) / 0.5)' }}>{g.pct > 0 ? '+' : ''}{g.pct}%</span></span>
                      </div>
                    ))}
                  </div>
                  {top.points.length >= 3 && (
                    <div className="h-28 mt-3 -ml-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={top.points.map((p) => ({ label: fmtDate(p.date, { day: '2-digit', month: '2-digit' }), v: p.e1rm }))} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
                          <XAxis dataKey="label" tick={{ fill: 'rgb(var(--text) / 0.4)', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={18} />
                          <YAxis tick={{ fill: 'rgb(var(--text) / 0.4)', fontSize: 10 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                          <Line type="monotone" dataKey="v" stroke={GOLD} strokeWidth={2.5} dot={{ r: 2.5, fill: GOLD }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <p className="text-[11px] text-white/35 mt-2">{t('Letzte 8 Wochen · bester Arbeitssatz pro Training')}</p>
                </div>
              );
            }
            if (sec === 'health' && (stats.steps.recent || stats.sleepMin.recent || stats.restingHr.recent)) {
              const row = (Icon: typeof Footprints, label: string, tr: { recent: number | null; previous: number | null }, fmt: (n: number) => string, lowerIsBetter = false) => {
                if (!tr.recent) return null;
                const diff = tr.previous ? tr.recent - tr.previous : 0;
                const good = lowerIsBetter ? diff < 0 : diff > 0;
                return (
                  <div className="flex items-center gap-3">
                    <Icon size={18} className="text-adlr-gold shrink-0" />
                    <span className="flex-1 text-sm text-white/75">{label}</span>
                    <span className="text-sm font-bold text-white">{fmt(tr.recent)}</span>
                    {tr.previous != null && diff !== 0 && <span className="text-xs font-semibold w-14 text-right" style={{ color: good ? '#22c55e' : '#fb923c' }}>{diff > 0 ? '▲' : '▼'} {fmt(Math.abs(diff))}</span>}
                  </div>
                );
              };
              return (
                <div key={sec} className="rounded-3xl p-5 space-y-3" style={CARD}>
                  <p className="text-sm font-semibold text-white flex items-center gap-2"><HeartPulse size={16} className="text-adlr-gold" /> {t('Gesundheit · letzte 4 Wochen')}</p>
                  {row(Footprints, t('Schritte pro Tag (Ø)'), stats.steps, (n) => fmtNum(n))}
                  {row(Moon, t('Schlaf pro Nacht (Ø)'), stats.sleepMin, (n) => `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}`)}
                  {row(HeartPulse, t('Ruhepuls (Ø)'), stats.restingHr, (n) => `${n} bpm`, true)}
                </div>
              );
            }
            return null;
          })}

          {/* Day 1 vs. today */}
          {(stats.photos || stats.measurements.length > 0) && (
            <div className="rounded-3xl p-5" style={CARD}>
              <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Camera size={16} className="text-adlr-gold" /> {t('Tag 1 vs. heute')}</p>
              {stats.photos && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[[stats.photos.first, stats.photos.firstDate], [stats.photos.latest, stats.photos.latestDate]].map(([p, d], i) => (
                    <div key={i}>
                      <div className="aspect-[3/4] rounded-xl overflow-hidden bg-inset"><SignedPhoto path={p} /></div>
                      <p className="text-[11px] text-white/45 mt-1 text-center">{i === 0 ? t('Start') : t('Heute')} · {fmtDate(d, { day: '2-digit', month: '2-digit', year: '2-digit' })}</p>
                    </div>
                  ))}
                </div>
              )}
              {stats.measurements.length > 0 && (
                <div className="space-y-1.5">
                  {stats.measurements.map((m) => {
                    const unit = m.key === 'weight_kg' ? 'kg' : 'cm';
                    const d = Math.round((m.current - m.start) * 10) / 10;
                    return (
                      <div key={m.key} className="flex items-center text-sm">
                        <span className="flex-1 text-white/60">{t(MEASURE_LABEL[m.key])}</span>
                        <span className="w-20 text-right text-white/45">{fmtNum(m.start)} {unit}</span>
                        <span className="w-20 text-right font-semibold text-white">{fmtNum(m.current)} {unit}</span>
                        <span className="w-14 text-right text-xs text-white/50">{d > 0 ? '+' : ''}{fmtNum(d)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <p className="text-center text-sm text-white/45 pt-2">{t('Jede Woche zählt. Bleib dran — wir sehen uns im nächsten Bericht.')}</p>
        </div>
      )}
    </div>
  );

  return createPortal(body, document.body);
}
