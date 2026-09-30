import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useCoachName } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';
import type { NutritionTip, HydrationLog, ProgressEntry } from '@/lib/types';
import { Card, SectionHeader, Loading, Button, Input, Field } from '@/components/ui';
import { Plus, Minus, Droplets, Calculator, Flame, Beef, HeartPulse, ChevronRight, Sparkles } from 'lucide-react';
import { t, fmtNum, fmtDate } from '@/lib/i18n';

const ACTIVITY_LEVELS = [
  { label: 'Sitzend', factor: 1.2 },
  { label: 'Leicht aktiv', factor: 1.375 },
  { label: 'Mäßig aktiv', factor: 1.55 },
  { label: 'Sehr aktiv', factor: 1.725 },
];

const WATER_GOAL = 8;
const DAY = 86400000;

// Protein guidance (g per kg body weight) by the client's primary goal.
const PROTEIN_PER_KG: Record<string, number> = { 'Muskeln aufbauen': 2.0, 'Gewicht reduzieren': 1.8 };

interface HealthRow { day: string; kcal_in: number | null }

export default function NutritionScreen() {
  const { profile } = useAuth();
  const coach = useCoachName();
  const nav = useNavigate();
  const [tip, setTip] = useState<NutritionTip | null>(null);
  const [hydration, setHydration] = useState<HydrationLog | null>(null);
  const [health, setHealth] = useState<HealthRow[]>([]);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [showCalc, setShowCalc] = useState(false);
  const [calcResult, setCalcResult] = useState<{ tdee: number; target: number; goal: string } | null>(null);
  const [calcForm, setCalcForm] = useState({
    gender: 'male' as 'male' | 'female',
    age: '',
    height: '',
    weight: '',
    activity: 1.55,
    goal: 'recomp' as 'reduce' | 'maintain' | 'gain',
    rate: 0.5,
  });
  const [loading, setLoading] = useState(true);

  const today = localDateKey(new Date());

  const load = async () => {
    if (!profile) return;
    const since = localDateKey(new Date(Date.now() - 6 * DAY));
    const [tipRes, hydRes, peRes, hd] = await Promise.all([
      supabase.from('nutrition_tips').select('*').eq('client_id', profile.id).maybeSingle(),
      supabase.from('hydration_logs').select('*').eq('client_id', profile.id).eq('log_date', today).maybeSingle(),
      supabase.from('progress_entries').select('*').eq('client_id', profile.id).order('logged_at', { ascending: false }).limit(1),
      supabase.from('health_daily').select('day, kcal_in').eq('client_id', profile.id).gte('day', since),
    ]);
    setTip(tipRes.data as NutritionTip | null);
    setHydration(hydRes.data as HydrationLog | null);
    setHealth((hd.data ?? []) as HealthRow[]);
    const pe = (peRes.data ?? []) as ProgressEntry[];
    const w = pe[0]?.weight_kg ?? profile.weight_kg ?? null;
    setLatestWeight(w);
    if (w) setCalcForm((f) => ({ ...f, weight: w.toString() }));
    if (profile.age) setCalcForm((f) => ({ ...f, age: profile.age!.toString() }));
    if (profile.height_cm) setCalcForm((f) => ({ ...f, height: profile.height_cm!.toString() }));
    if (profile.gender) setCalcForm((f) => ({ ...f, gender: /^(frau|weiblich)/i.test(profile.gender ?? '') ? 'female' : 'male' }));
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

  const adjustWater = async (delta: number) => {
    if (!profile) return;
    const next = Math.max(0, (hydration?.glasses ?? 0) + delta);
    setHydration((h) => (h ? { ...h, glasses: next } : h)); // optimistic
    if (hydration) {
      await supabase.from('hydration_logs').update({ glasses: next }).eq('id', hydration.id);
    } else {
      await supabase.from('hydration_logs').insert({ client_id: profile.id, glasses: next, log_date: today });
    }
    load();
  };

  const calculateCalories = () => {
    const w = Number(calcForm.weight);
    const h = Number(calcForm.height);
    const a = Number(calcForm.age);
    if (!w || !h || !a) return;
    const bmr = calcForm.gender === 'male'
      ? 10 * w + 6.25 * h - 5 * a + 5
      : 10 * w + 6.25 * h - 5 * a - 161;
    const tdee = Math.round(bmr * calcForm.activity);
    let target = tdee;
    let goalLabel = 'Halten';
    if (calcForm.goal === 'reduce') {
      const kgPerWeek = (calcForm.rate / 100) * w;
      target = tdee - Math.round((kgPerWeek * 7700) / 7);
      goalLabel = 'Reduzieren';
    } else if (calcForm.goal === 'gain') {
      const kgPerWeek = (calcForm.rate / 100) * w;
      target = tdee + Math.round((kgPerWeek * 7700) / 7);
      goalLabel = 'Aufbauen';
    }
    setCalcResult({ tdee, target: Math.round(target), goal: goalLabel });
  };

  const maxRate = calcForm.goal === 'reduce' ? 1.0 : calcForm.goal === 'gain' ? 0.25 : 0;

  if (loading) return <Loading />;

  const glasses = hydration?.glasses ?? 0;
  const primaryGoal = profile?.intake?.goals?.[0] ?? null;
  const target = profile?.kcal_target ?? calcResult?.target ?? null;
  const eatenToday = health.find((h) => h.day === today)?.kcal_in ?? null;
  const healthConnected = health.some((h) => h.kcal_in != null && h.kcal_in > 0);
  const proteinG = latestWeight ? Math.round((latestWeight * (PROTEIN_PER_KG[primaryGoal ?? ''] ?? 1.6)) / 5) * 5 : null;

  // Last 7 days (oldest → today) for the bar chart.
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * DAY);
    const key = localDateKey(d);
    return { key, d, kcal: health.find((h) => h.day === key)?.kcal_in ?? null };
  });
  const logged = week.filter((w) => w.kcal && w.kcal > 0);
  const avgKcal = logged.length ? Math.round(logged.reduce((s, w) => s + (w.kcal ?? 0), 0) / logged.length) : null;
  const maxBar = Math.max(target ?? 0, ...logged.map((w) => w.kcal ?? 0), 1);

  const R = 52, C = 2 * Math.PI * R;
  const pct = target && eatenToday ? Math.min(1, eatenToday / target) : 0;
  const over = target != null && eatenToday != null && eatenToday > target * 1.1;

  return (
    <div className="adlr-fade-in">
      <SectionHeader title={t('Ernährung')} subtitle={t('Du bist, was du isst.')} />

      {/* Today: calories vs. target (from Apple Health / Health Connect, e.g. YAZIO) */}
      <Card className="mb-4">
        <div className="flex items-center gap-5">
          <div className="relative w-32 h-32 shrink-0">
            <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-90">
              <circle cx="60" cy="60" r={R} fill="none" stroke="rgb(var(--text) / 0.08)" strokeWidth="10" />
              <circle cx="60" cy="60" r={R} fill="none" stroke={over ? '#fb923c' : 'rgb(var(--adlr-gold))'} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-bold text-white leading-none">{eatenToday != null ? fmtNum(eatenToday) : '—'}</span>
              <span className="text-[10px] uppercase tracking-wide text-white/40 mt-1">{t('kcal heute')}</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2.5">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-white/40 flex items-center gap-1"><Flame size={12} className="text-adlr-gold" /> {t('Tagesziel')}</p>
              <p className="text-lg font-bold text-white">{target ? `${fmtNum(target)} kcal` : '—'}</p>
              {target && eatenToday != null && (
                <p className="text-xs" style={{ color: over ? '#fb923c' : 'rgb(var(--text) / 0.55)' }}>
                  {eatenToday <= target ? t('{n} kcal übrig', { n: fmtNum(target - eatenToday) }) : t('{n} kcal über dem Ziel', { n: fmtNum(eatenToday - target) })}
                </p>
              )}
              {!target && <p className="text-xs text-white/45">{t('Dein Coach legt dein Ziel fest — oder berechne es unten.')}</p>}
            </div>
            {proteinG && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/40 flex items-center gap-1"><Beef size={12} className="text-adlr-gold" /> {t('Protein-Ziel')}</p>
                <p className="text-lg font-bold text-white">~{fmtNum(proteinG)} g</p>
                <p className="text-xs text-white/45">{t('≈ {n} Portionen à 30 g', { n: Math.round(proteinG / 30) })}</p>
              </div>
            )}
          </div>
        </div>
        {!healthConnected && (
          <button onClick={() => nav('/app/profil')} className="adlr-tap w-full mt-4 pt-3 flex items-center gap-2 text-left" style={{ borderTop: '1px solid rgb(var(--text) / 0.07)' }}>
            <HeartPulse size={16} className="text-adlr-gold shrink-0" />
            <span className="flex-1 text-xs text-white/60">{t('Verbinde Apple Health / Health Connect (z. B. mit YAZIO) — dann erscheinen deine Kalorien hier automatisch.')}</span>
            <ChevronRight size={16} className="text-white/30 shrink-0" />
          </button>
        )}
      </Card>

      {/* Last 7 days */}
      {logged.length > 0 && (
        <Card className="mb-4">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-sm font-medium text-white/80">{t('Letzte 7 Tage')}</p>
            {avgKcal != null && <p className="text-xs text-white/45">{t('Ø {n} kcal', { n: fmtNum(avgKcal) })}</p>}
          </div>
          <div className="relative h-28 flex items-end gap-2">
            {target && (
              <div className="absolute left-0 right-0 border-t border-dashed" style={{ bottom: `${(target / maxBar) * 100}%`, borderColor: 'rgb(var(--adlr-gold) / 0.5)' }} />
            )}
            {week.map((w) => {
              const h = w.kcal ? Math.max(4, (w.kcal / maxBar) * 100) : 3;
              const ok = target && w.kcal ? Math.abs(w.kcal / target - 1) <= 0.1 : false;
              return (
                <div key={w.key} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="w-full rounded-md" style={{ height: `${h}%`, background: !w.kcal ? 'rgb(var(--text) / 0.08)' : ok ? '#22c55e' : target && w.kcal > target ? '#fb923c' : 'rgb(var(--adlr-gold))' }} />
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 mt-1.5">
            {week.map((w) => <span key={w.key} className="flex-1 text-center text-[10px] text-white/40">{fmtDate(w.d, { weekday: 'short' })}</span>)}
          </div>
          {target && <p className="text-[11px] text-white/35 mt-2">{t('Grün = im Zielbereich (±10 %) · gestrichelt = dein Tagesziel')}</p>}
        </Card>
      )}

      {/* Water — one compact row */}
      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <Droplets size={20} className="text-adlr-gold shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white/85">{t('Wasser')}</p>
            <div className="flex gap-1 mt-1.5">
              {Array.from({ length: WATER_GOAL }, (_, i) => (
                <span key={i} className="flex-1 h-2 rounded-full" style={{ background: i < glasses ? 'rgb(var(--adlr-gold))' : 'rgb(var(--text) / 0.1)' }} />
              ))}
            </div>
            <p className="text-[11px] text-white/40 mt-1">{t('{n} / {goal} Gläser', { n: glasses, goal: WATER_GOAL })}</p>
          </div>
          <button onClick={() => adjustWater(-1)} disabled={glasses === 0} className="adlr-tap w-9 h-9 rounded-full bg-white/5 border border-white/10 text-white/60 flex items-center justify-center disabled:opacity-30" aria-label={t('Glas entfernen')}><Minus size={15} /></button>
          <button onClick={() => adjustWater(1)} className="adlr-tap w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }} aria-label={t('Glas')}><Plus size={18} /></button>
        </div>
      </Card>

      {/* Weekly tip from Peter */}
      {tip && (
        <Card className="mb-4 adlr-gold-border bg-gradient-to-br from-adlr-gold/5 to-transparent">
          <p className="text-xs text-adlr-gold/80 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Sparkles size={13} /> {t('Tipp von {coach}', { coach })}</p>
          <p className="text-sm text-white/90 leading-relaxed">{tip.tip}</p>
        </Card>
      )}

      {/* Calorie calculator */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-white/80 flex items-center gap-2"><Calculator size={16} className="text-adlr-gold" /> {t('Kalorienrechner')}</p>
          <button onClick={() => setShowCalc(!showCalc)} className="text-adlr-gold text-sm adlr-tap">
            {showCalc ? t('Schließen') : t('Berechnen')}
          </button>
        </div>
        {calcResult && !showCalc && (
          <div className="text-center py-2">
            <p className="text-3xl font-bold adlr-gold-text">{fmtNum(calcResult.target)} kcal</p>
            <p className="text-xs text-white/40 mt-1">{t('Tagesziel')} · {t(calcResult.goal)}</p>
            <p className="text-xs text-white/30 mt-0.5">{t('Erhaltung')}: {fmtNum(calcResult.tdee)} kcal</p>
          </div>
        )}
        {showCalc && (
          <div className="space-y-3 adlr-fade-in">
            {/* Gender */}
            <div className="flex gap-2">
              <button
                onClick={() => setCalcForm({ ...calcForm, gender: 'male' })}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium adlr-tap border transition-all ${
                  calcForm.gender === 'male' ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/50 border-white/10'
                }`}
              >{t('Männlich')}</button>
              <button
                onClick={() => setCalcForm({ ...calcForm, gender: 'female' })}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium adlr-tap border transition-all ${
                  calcForm.gender === 'female' ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/50 border-white/10'
                }`}
              >{t('Weiblich')}</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label={t('Alter')}><Input type="number" value={calcForm.age} onChange={(e) => setCalcForm({ ...calcForm, age: e.target.value })} placeholder="30" /></Field>
              <Field label={t('Größe (cm)')}><Input type="number" value={calcForm.height} onChange={(e) => setCalcForm({ ...calcForm, height: e.target.value })} placeholder="175" /></Field>
              <Field label={t('Gewicht (kg)')}><Input type="number" value={calcForm.weight} onChange={(e) => setCalcForm({ ...calcForm, weight: e.target.value })} placeholder="80" /></Field>
            </div>
            {/* Activity */}
            <Field label={t('Aktivitätslevel')}>
              <div className="grid grid-cols-2 gap-2">
                {ACTIVITY_LEVELS.map((a) => (
                  <button
                    key={a.factor}
                    onClick={() => setCalcForm({ ...calcForm, activity: a.factor })}
                    className={`py-2.5 rounded-xl text-xs font-medium adlr-tap border transition-all ${
                      calcForm.activity === a.factor ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/50 border-white/10'
                    }`}
                  >{t(a.label)} ×{fmtNum(a.factor)}</button>
                ))}
              </div>
            </Field>
            {/* Goal */}
            <Field label={t('Ziel')}>
              <div className="flex gap-2">
                <button onClick={() => setCalcForm({ ...calcForm, goal: 'reduce', rate: 0.5 })} className={`flex-1 py-2.5 rounded-xl text-sm font-medium adlr-tap border transition-all ${calcForm.goal === 'reduce' ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/50 border-white/10'}`}>{t('Reduzieren')}</button>
                <button onClick={() => setCalcForm({ ...calcForm, goal: 'maintain', rate: 0 })} className={`flex-1 py-2.5 rounded-xl text-sm font-medium adlr-tap border transition-all ${calcForm.goal === 'maintain' ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/50 border-white/10'}`}>{t('Halten')}</button>
                <button onClick={() => setCalcForm({ ...calcForm, goal: 'gain', rate: 0.25 })} className={`flex-1 py-2.5 rounded-xl text-sm font-medium adlr-tap border transition-all ${calcForm.goal === 'gain' ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/50 border-white/10'}`}>{t('Aufbauen')}</button>
              </div>
            </Field>
            {/* Rate slider */}
            {calcForm.goal !== 'maintain' && maxRate > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/50 uppercase tracking-wide">{t('Wöchentliche Veränderung')}</span>
                  <span className="text-xs text-adlr-gold font-medium">{t('{rate}% / Woche', { rate: fmtNum(calcForm.rate, { minimumFractionDigits: 2 }) })}</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={maxRate}
                  step={0.05}
                  value={calcForm.rate}
                  onChange={(e) => setCalcForm({ ...calcForm, rate: Number(e.target.value) })}
                  className="w-full accent-[rgb(var(--adlr-gold))]"
                />
                <div className="flex justify-between text-[10px] text-white/30 mt-1">
                  <span>{fmtNum(0.1)}%</span>
                  <span>{t('Max')}: {fmtNum(maxRate, { minimumFractionDigits: 2 })}%</span>
                </div>
              </div>
            )}
            <Button onClick={calculateCalories} className="w-full">{t('Berechnen')}</Button>
            {calcResult && (
              <div className="text-center py-3 rounded-xl" style={{ background: 'rgb(var(--adlr-gold) / 0.08)', border: '1px solid rgb(var(--adlr-gold) / 0.2)' }}>
                <p className="text-3xl font-bold adlr-gold-text">{fmtNum(calcResult.target)} kcal</p>
                <p className="text-xs text-white/50 mt-1">{t('Tagesziel')} · {t(calcResult.goal)}</p>
                <p className="text-xs text-white/40 mt-0.5">{t('Erhaltungskalorien (TDEE)')}: {fmtNum(calcResult.tdee)} kcal</p>
                <p className="text-[11px] text-white/30 mt-2 leading-relaxed max-w-xs mx-auto">
                  {calcForm.goal === 'reduce' && `${t('Tagesdefizit')}: ${fmtNum(calcResult.tdee - calcResult.target)} kcal`}
                  {calcForm.goal === 'gain' && `${t('Tagesüberschuss')}: ${fmtNum(calcResult.target - calcResult.tdee)} kcal`}
                  {calcForm.goal === 'maintain' && t('Entspricht deinem Erhaltungsbedarf')}
                </p>
              </div>
            )}
            {/* Mandatory disclaimer */}
            <div className="rounded-xl p-3" style={{ background: 'rgb(var(--text) / 0.03)', border: '1px solid rgb(var(--text) / 0.08)' }}>
              <p className="text-[11px] text-white/40 leading-relaxed">
                {t('Dieser Wert ist eine Schätzung auf Basis anerkannter Formeln und dient als Orientierung. Er ersetzt keine individuelle Ernährungsberatung durch eine diplomierte Fachkraft. Bei Vorerkrankungen bitte vorher ärztlich abklären.')}
              </p>
            </div>
          </div>
        )}
      </Card>

    </div>
  );
}
