import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { NutritionTip, HydrationLog, NutritionPrincipleCheckin, ProgressEntry } from '@/lib/types';
import { Card, SectionHeader, Loading, Button, Input, Field } from '@/components/ui';
import { Plus, Minus, Droplets, Check, X, Calculator, Flame } from 'lucide-react';

const PRINCIPLES: Record<string, string[]> = {
  'Gewicht reduzieren': ['Protein bei jeder Mahlzeit', 'Zucker meiden', 'Wasser vor jedem Essen'],
  'Muskeln aufbauen': ['1.6-2g Protein pro kg Körpergewicht', 'Kalorienüberschuss', 'Post-Workout-Carb'],
  default: ['Protein bei jeder Mahlzeit', 'Verarbeitetes meiden', 'Wasser trinken'],
};

const ACTIVITY_LEVELS = [
  { label: 'Sitzend', factor: 1.2 },
  { label: 'Leicht aktiv', factor: 1.375 },
  { label: 'Mäßig aktiv', factor: 1.55 },
  { label: 'Sehr aktiv', factor: 1.725 },
];

function getWeekDates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  const day = today.getDay() === 0 ? 6 : today.getDay() - 1; // Mon=0
  const monday = new Date(today);
  monday.setDate(today.getDate() - day);
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export default function NutritionScreen() {
  const { profile } = useAuth();
  const [tip, setTip] = useState<NutritionTip | null>(null);
  const [hydration, setHydration] = useState<HydrationLog | null>(null);
  const [checkins, setCheckins] = useState<NutritionPrincipleCheckin[]>([]);
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

  const today = new Date().toISOString().slice(0, 10);
  const weekDates = getWeekDates();

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const [tipRes, hydRes, checkinRes, peRes] = await Promise.all([
      supabase.from('nutrition_tips').select('*').eq('client_id', profile.id).maybeSingle(),
      supabase.from('hydration_logs').select('*').eq('client_id', profile.id).eq('log_date', today).maybeSingle(),
      supabase.from('nutrition_principle_checkins').select('*').eq('client_id', profile.id).order('log_date', { ascending: false }).limit(50),
      supabase.from('progress_entries').select('*').eq('client_id', profile.id).order('logged_at', { ascending: false }).limit(1),
    ]);
    setTip(tipRes.data as NutritionTip | null);
    setHydration(hydRes.data as HydrationLog | null);
    setCheckins((checkinRes.data ?? []) as NutritionPrincipleCheckin[]);
    const pe = (peRes.data ?? []) as ProgressEntry[];
    const w = pe[0]?.weight_kg ?? profile.weight_kg ?? null;
    setLatestWeight(w);
    if (w) setCalcForm((f) => ({ ...f, weight: w.toString() }));
    if (profile.age) setCalcForm((f) => ({ ...f, age: profile.age!.toString() }));
    if (profile.height_cm) setCalcForm((f) => ({ ...f, height: profile.height_cm!.toString() }));
    if (profile.gender) setCalcForm((f) => ({ ...f, gender: profile.gender === 'weiblich' ? 'female' : 'male' }));
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

  const adjustWater = async (delta: number) => {
    if (!profile) return;
    const cur = hydration?.glasses ?? 0;
    const next = Math.max(0, cur + delta);
    if (hydration) {
      await supabase.from('hydration_logs').update({ glasses: next }).eq('id', hydration.id);
    } else {
      await supabase.from('hydration_logs').insert({ client_id: profile.id, glasses: next, log_date: today });
    }
    load();
  };

  const togglePrinciple = async (principle: string, adhered: boolean) => {
    if (!profile) return;
    // Check if today's check-in for this principle already exists
    const existing = checkins.find((c) => c.principle === principle && c.log_date === today);
    if (existing) {
      // Update existing
      await supabase.from('nutrition_principle_checkins').update({ adhered }).eq('id', existing.id);
    } else {
      // Insert new
      await supabase.from('nutrition_principle_checkins').insert({
        client_id: profile.id,
        principle,
        adhered,
        log_date: today,
      });
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
      const dailyDeficit = Math.round((kgPerWeek * 7700) / 7);
      target = tdee - dailyDeficit;
      goalLabel = 'Reduzieren';
    } else if (calcForm.goal === 'gain') {
      const kgPerWeek = (calcForm.rate / 100) * w;
      const dailySurplus = Math.round((kgPerWeek * 7700) / 7);
      target = tdee + dailySurplus;
      goalLabel = 'Aufbauen';
    }
    setCalcResult({ tdee, target: Math.round(target), goal: goalLabel });
  };

  const maxRate = calcForm.goal === 'reduce' ? 1.0 : calcForm.goal === 'gain' ? 0.25 : 0;

  if (loading) return <Loading />;

  const goal = 8;
  const glasses = hydration?.glasses ?? 0;
  const pct = Math.min(100, (glasses / goal) * 100);
  const primaryGoal = profile?.intake?.goals?.[0] ?? 'default';
  const principles = PRINCIPLES[primaryGoal] ?? PRINCIPLES.default;

  // Weekly summary per principle
  const weekSummary = principles.map((p) => {
    const daysAdhered = weekDates.filter((d) =>
      checkins.some((c) => c.principle === p && c.log_date === d && c.adhered)
    ).length;
    return { principle: p, daysAdhered, total: 7 };
  });

  // Today's check-ins
  const todayCheckins = new Map(principles.map((p) => [p, checkins.find((c) => c.principle === p && c.log_date === today)]));

  return (
    <div className="adlr-fade-in">
      <SectionHeader title="Ernährung" subtitle="Du bist, was du isst." />

      {/* Hydration */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-white/80 flex items-center gap-2"><Droplets size={16} className="text-adlr-gold" /> Hydration</p>
          <span className="text-xs text-white/40">{glasses} / {goal} Gläser</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative w-24 h-24 flex-shrink-0">
            <svg width="96" height="96" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="42" stroke="rgb(var(--text) / 0.12)" strokeWidth="6" fill="none" />
              <circle
                cx="48" cy="48" r="42" stroke="rgb(var(--adlr-gold))" strokeWidth="6" fill="none"
                strokeDasharray={`${2 * Math.PI * 42}`}
                strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 48 48)"
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold adlr-gold-text">{glasses}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <button onClick={() => adjustWater(1)} className="adlr-tap flex-1 py-4 rounded-xl bg-adlr-gold/10 border border-adlr-gold/30 text-adlr-gold flex items-center justify-center gap-2"><Plus size={18} /> Glas</button>
            <button onClick={() => adjustWater(-1)} className="adlr-tap py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 flex items-center justify-center gap-2"><Minus size={14} /> Glas entfernen</button>
          </div>
        </div>
      </Card>

      {/* Calorie calculator */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-white/80 flex items-center gap-2"><Calculator size={16} className="text-adlr-gold" /> Kalorienrechner</p>
          <button onClick={() => setShowCalc(!showCalc)} className="text-adlr-gold text-sm adlr-tap">
            {showCalc ? 'Schließen' : 'Berechnen'}
          </button>
        </div>
        {calcResult && !showCalc && (
          <div className="text-center py-2">
            <p className="text-3xl font-bold adlr-gold-text">{calcResult.target} kcal</p>
            <p className="text-xs text-white/40 mt-1">Tagesziel · {calcResult.goal}</p>
            <p className="text-xs text-white/30 mt-0.5">Erhaltung: {calcResult.tdee} kcal</p>
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
              >Männlich</button>
              <button
                onClick={() => setCalcForm({ ...calcForm, gender: 'female' })}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium adlr-tap border transition-all ${
                  calcForm.gender === 'female' ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/50 border-white/10'
                }`}
              >Weiblich</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Alter"><Input type="number" value={calcForm.age} onChange={(e) => setCalcForm({ ...calcForm, age: e.target.value })} placeholder="30" /></Field>
              <Field label="Größe (cm)"><Input type="number" value={calcForm.height} onChange={(e) => setCalcForm({ ...calcForm, height: e.target.value })} placeholder="175" /></Field>
              <Field label="Gewicht (kg)"><Input type="number" value={calcForm.weight} onChange={(e) => setCalcForm({ ...calcForm, weight: e.target.value })} placeholder="80" /></Field>
            </div>
            {/* Activity */}
            <Field label="Aktivitätslevel">
              <div className="grid grid-cols-2 gap-2">
                {ACTIVITY_LEVELS.map((a) => (
                  <button
                    key={a.factor}
                    onClick={() => setCalcForm({ ...calcForm, activity: a.factor })}
                    className={`py-2.5 rounded-xl text-xs font-medium adlr-tap border transition-all ${
                      calcForm.activity === a.factor ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/50 border-white/10'
                    }`}
                  >{a.label} ×{a.factor}</button>
                ))}
              </div>
            </Field>
            {/* Goal */}
            <Field label="Ziel">
              <div className="flex gap-2">
                <button onClick={() => setCalcForm({ ...calcForm, goal: 'reduce', rate: 0.5 })} className={`flex-1 py-2.5 rounded-xl text-sm font-medium adlr-tap border transition-all ${calcForm.goal === 'reduce' ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/50 border-white/10'}`}>Reduzieren</button>
                <button onClick={() => setCalcForm({ ...calcForm, goal: 'maintain', rate: 0 })} className={`flex-1 py-2.5 rounded-xl text-sm font-medium adlr-tap border transition-all ${calcForm.goal === 'maintain' ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/50 border-white/10'}`}>Halten</button>
                <button onClick={() => setCalcForm({ ...calcForm, goal: 'gain', rate: 0.25 })} className={`flex-1 py-2.5 rounded-xl text-sm font-medium adlr-tap border transition-all ${calcForm.goal === 'gain' ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/50 border-white/10'}`}>Aufbauen</button>
              </div>
            </Field>
            {/* Rate slider */}
            {calcForm.goal !== 'maintain' && maxRate > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/50 uppercase tracking-wide">Wöchentliche Veränderung</span>
                  <span className="text-xs text-adlr-gold font-medium">{calcForm.rate.toFixed(2)}% / Woche</span>
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
                  <span>0.1%</span>
                  <span>Max: {maxRate.toFixed(2)}%</span>
                </div>
              </div>
            )}
            <Button onClick={calculateCalories} className="w-full">Berechnen</Button>
            {calcResult && (
              <div className="text-center py-3 rounded-xl" style={{ background: 'rgb(var(--adlr-gold) / 0.08)', border: '1px solid rgb(var(--adlr-gold) / 0.2)' }}>
                <p className="text-3xl font-bold adlr-gold-text">{calcResult.target} kcal</p>
                <p className="text-xs text-white/50 mt-1">Tagesziel · {calcResult.goal}</p>
                <p className="text-xs text-white/40 mt-0.5">Erhaltungskalorien (TDEE): {calcResult.tdee} kcal</p>
                <p className="text-[11px] text-white/30 mt-2 leading-relaxed max-w-xs mx-auto">
                  {calcForm.goal === 'reduce' && `Tagesdefizit: ${calcResult.tdee - calcResult.target} kcal`}
                  {calcForm.goal === 'gain' && `Tagesüberschuss: ${calcResult.target - calcResult.tdee} kcal`}
                  {calcForm.goal === 'maintain' && 'Entspricht deinem Erhaltungsbedarf'}
                </p>
              </div>
            )}
            {/* Mandatory disclaimer */}
            <div className="rounded-xl p-3" style={{ background: 'rgb(var(--text) / 0.03)', border: '1px solid rgb(var(--text) / 0.08)' }}>
              <p className="text-[11px] text-white/40 leading-relaxed">
                Dieser Wert ist eine Schätzung auf Basis anerkannter Formeln und dient als Orientierung. Er ersetzt keine individuelle Ernährungsberatung durch eine diplomierte Fachkraft. Bei Vorerkrankungen bitte vorher ärztlich abklären.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Daily principle check-ins */}
      <Card className="mb-5">
        <p className="text-sm font-medium text-white/80 mb-1">Tägliche Prinzipien</p>
        <p className="text-xs text-white/40 mb-4">Basierend auf deinem Ziel: <span className="text-adlr-gold/80">{primaryGoal}</span></p>
        {calcResult && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg" style={{ background: 'rgb(var(--adlr-gold) / 0.08)', border: '1px solid rgb(var(--adlr-gold) / 0.15)' }}>
            <Flame size={14} className="text-adlr-gold shrink-0" />
            <span className="text-xs text-white/70">Tagesziel: <span className="adlr-gold-text font-bold">{calcResult.target} kcal</span></span>
          </div>
        )}
        <div className="space-y-3">
          {principles.map((p, i) => {
            const existing = todayCheckins.get(p);
            const adhered = existing?.adhered;
            return (
              <div key={i} className="rounded-xl p-3" style={{ background: 'rgb(var(--text) / 0.03)', border: '1px solid rgb(var(--text) / 0.06)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-6 h-6 rounded-full bg-adlr-gold/10 border border-adlr-gold/30 text-adlr-gold text-xs flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                  <span className="text-sm text-white/80 flex-1">{p}</span>
                </div>
                <div className="flex gap-2 ml-9">
                  <button
                    onClick={() => togglePrinciple(p, true)}
                    className={`adlr-tap flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                      adhered === true
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-white/5 text-white/40 border border-white/10'
                    }`}
                  >
                    <Check size={13} /> Ja
                  </button>
                  <button
                    onClick={() => togglePrinciple(p, false)}
                    className={`adlr-tap flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                      adhered === false
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-white/5 text-white/40 border border-white/10'
                    }`}
                  >
                    <X size={13} /> Nein
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Weekly summary */}
      <Card className="mb-5">
        <p className="text-sm font-medium text-white/80 mb-1">Wochenrückblick</p>
        <p className="text-xs text-white/40 mb-4">Diese Woche ({DAY_LABELS[0]}–{DAY_LABELS[6]})</p>
        <div className="space-y-3">
          {weekSummary.map((ws, i) => {
            const pctVal = Math.round((ws.daysAdhered / ws.total) * 100);
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-white/70">{ws.principle}</span>
                  <span className="text-xs text-adlr-gold font-medium">{ws.daysAdhered}/{ws.total} Tage · {pctVal}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pctVal}%`,
                      background: pctVal >= 70 ? '#22c55e' : pctVal >= 40 ? 'rgb(var(--adlr-gold))' : '#f87171',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Weekly tip from Peter */}
      <Card className="adlr-gold-border bg-gradient-to-br from-adlr-gold/5 to-transparent">
        <p className="text-xs text-adlr-gold/80 uppercase tracking-wide mb-2">Tipp von Peter</p>
        {tip ? (
          <p className="text-sm text-white/90 leading-relaxed">{tip.tip}</p>
        ) : (
          <p className="text-sm text-white/40">Peter bereitet deinen Tipp vor.</p>
        )}
      </Card>
    </div>
  );
}
