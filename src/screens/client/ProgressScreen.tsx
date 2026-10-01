import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { ProgressEntry, PersonalRecord, DailyCheckin, ProgressPhoto, ExerciseSetLog, WorkoutCompletion } from '@/lib/types';
import ChallengeCard from '@/components/ChallengeCard';
import { Card, SectionHeader, Loading, Button, Input, Field } from '@/components/ui';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Plus, Award, Camera, TrendingUp, Ruler, BarChart3, ChevronRight, Sparkles } from 'lucide-react';
import MonthlyReport from '@/components/MonthlyReport';
import ExerciseProgress from '@/components/ExerciseProgress';
import PersonalRecords from '@/components/PersonalRecords';
import SignedPhoto from '@/components/SignedPhoto';
import { t, fmtDate as fmtD } from '@/lib/i18n';
import ProgressReport from '@/components/ProgressReport';

const MEASUREMENT_FIELDS: Array<{ key: keyof ProgressEntry; label: string; unit: string }> = [
  { key: 'weight_kg', label: 'Gewicht', unit: 'kg' },
  { key: 'waist_cm', label: 'Taille', unit: 'cm' },
  { key: 'chest_cm', label: 'Brust', unit: 'cm' },
  { key: 'hips_cm', label: 'Hüfte', unit: 'cm' },
  { key: 'arm_cm', label: 'Arme', unit: 'cm' },
  { key: 'thigh_cm', label: 'Oberschenkel', unit: 'cm' },
];

export default function ProgressScreen() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [setLogs, setSetLogs] = useState<ExerciseSetLog[]>([]);
  const [completions, setCompletions] = useState<WorkoutCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showPr, setShowPr] = useState(false);
  const [form, setForm] = useState({ weight: '', waist: '', chest: '', hips: '', arm: '', thigh: '' });
  const [prForm, setPrForm] = useState({ name: 'Bankdrücken', weight: '', reps: '1' });
  const [selectedMeasure, setSelectedMeasure] = useState<keyof ProgressEntry>('weight_kg');
  const [showReport, setShowReport] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const [e, p, c, ph, sl, wc] = await Promise.all([
      supabase.from('progress_entries').select('*').eq('client_id', profile.id).order('logged_at', { ascending: true }),
      supabase.from('personal_records').select('*').eq('client_id', profile.id).order('achieved_at', { ascending: false }),
      supabase.from('daily_checkins').select('*').eq('client_id', profile.id).order('logged_at', { ascending: false }).limit(7),
      supabase.from('progress_photos').select('*').eq('client_id', profile.id).order('photo_date', { ascending: false }),
      supabase.from('exercise_set_logs').select('*').eq('client_id', profile.id).order('created_at', { ascending: true }),
      supabase.from('workout_completions').select('*').eq('client_id', profile.id),
    ]);
    setCompletions((wc.data ?? []) as WorkoutCompletion[]);
    setEntries((e.data ?? []) as ProgressEntry[]);
    setPrs((p.data ?? []) as PersonalRecord[]);
    setCheckins((c.data ?? []) as DailyCheckin[]);
    setPhotos((ph.data ?? []) as ProgressPhoto[]);
    setSetLogs((sl.data ?? []) as ExerciseSetLog[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

  const addEntry = async () => {
    if (!profile) return;
    const payload: Record<string, number | string> = { client_id: profile.id };
    if (form.weight) payload.weight_kg = Number(form.weight);
    if (form.waist) payload.waist_cm = Number(form.waist);
    if (form.chest) payload.chest_cm = Number(form.chest);
    if (form.hips) payload.hips_cm = Number(form.hips);
    if (form.arm) payload.arm_cm = Number(form.arm);
    if (form.thigh) payload.thigh_cm = Number(form.thigh);
    await supabase.from('progress_entries').insert(payload);
    setForm({ weight: '', waist: '', chest: '', hips: '', arm: '', thigh: '' });
    setShowAdd(false);
    load();
  };

  const addPr = async () => {
    if (!profile || !prForm.weight) return;
    await supabase.from('personal_records').insert({
      client_id: profile.id,
      exercise_name: prForm.name,
      weight_kg: Number(prForm.weight),
      reps: Number(prForm.reps),
    });
    setPrForm({ name: 'Bankdrücken', weight: '', reps: '1' });
    setShowPr(false);
    load();
  };

  const uploadPhoto = async (file: File) => {
    if (!profile) return;
    const path = `${profile.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('photos').upload(path, file);
    if (error) { console.error(error); return; }
    await supabase.from('progress_photos').insert({ client_id: profile.id, storage_path: path });
    load();
  };

  const latest = entries[entries.length - 1];
  const fmtDate = (d: string) => fmtD(d, { day: '2-digit', month: '2-digit' });

  // Build chart data for selected measurement
  const selectedMeasureMeta = MEASUREMENT_FIELDS.find((m) => m.key === selectedMeasure)!;
  const chartData = entries
    .filter((e) => e[selectedMeasure] != null)
    .map((e) => ({ date: fmtDate(e.logged_at), value: e[selectedMeasure] as number }));

  // Build per-measurement chart data
  const measureCharts = MEASUREMENT_FIELDS.map((m) => ({
    ...m,
    data: entries.filter((e) => e[m.key] != null).map((e) => ({ date: fmtDate(e.logged_at), value: e[m.key] as number })),
  }));

  const avgCheckin = checkins.length > 0 ? (checkins.reduce((a, c) => a + c.energy + c.mood, 0) / (checkins.length * 2)).toFixed(1) : '—';

  if (loading) return <Loading />;

  return (
    <div className="adlr-fade-in">
      <SectionHeader title={t('Fortschritt')} subtitle={t('Zahlen lügen nicht.')} />
      <ChallengeCard mode="client" />

      {/* Goal-driven personal progress report (+ Peter's approved summary) */}
      <button
        onClick={() => setShowProgress(true)}
        className="adlr-tap w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-4 text-left"
        style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--adlr-gold) / 0.35)' }}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.15)' }}>
          <Sparkles size={18} className="text-adlr-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t('Dein Fortschrittsbericht')}</p>
          <p className="text-xs text-white/50">{t('Auf dein Ziel zugeschnitten — mit der Einschätzung deines Coaches')}</p>
        </div>
        <ChevronRight size={18} className="text-adlr-gold shrink-0" />
      </button>
      {showProgress && profile && <ProgressReport client={profile} onClose={() => setShowProgress(false)} />}

      {/* Monthly report — only once there's data from an earlier calendar month */}
      {setLogs.some((l) => { const d = new Date(l.created_at); return d.getFullYear() * 12 + d.getMonth() < new Date().getFullYear() * 12 + new Date().getMonth(); }) && (
        <button
          onClick={() => setShowReport(true)}
          className="adlr-tap w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-5 adlr-gold-border"
          style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold) / 0.14), rgb(var(--adlr-gold) / 0.04))' }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.15)' }}>
            <BarChart3 size={18} className="text-adlr-gold" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-white">{t('Monatsbericht')}</p>
            <p className="text-xs text-white/50">{t('Dein Monat in Zahlen — Muskeln, Volumen, Top-Übungen')}</p>
          </div>
          <ChevronRight size={18} className="text-adlr-gold shrink-0" />
        </button>
      )}

      {showReport && <MonthlyReport onClose={() => setShowReport(false)} />}

      {/* Weight & measurement chart */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-white/80 flex items-center gap-2"><TrendingUp size={16} className="text-adlr-gold" /> {t('Trend')}</p>
          <button onClick={() => setShowAdd(!showAdd)} className="text-adlr-gold text-sm flex items-center gap-1 adlr-tap">
            <Plus size={14} /> {t('Eintragen')}
          </button>
        </div>

        {/* Measurement selector tabs */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {measureCharts.map((m) => (
            <button
              key={m.key}
              onClick={() => setSelectedMeasure(m.key)}
              className={`adlr-tap px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-all ${
                selectedMeasure === m.key ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/50 border-white/10'
              }`}
            >
              {t(m.label)}
            </button>
          ))}
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <Line type="monotone" dataKey="value" stroke="rgb(var(--adlr-gold))" strokeWidth={2} dot={{ fill: 'rgb(var(--adlr-gold))', r: 3 }} />
              <XAxis dataKey="date" stroke="rgb(var(--text) / 0.25)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="rgb(var(--text) / 0.25)" fontSize={10} tickLine={false} axisLine={false} domain={['dataMin - 2', 'dataMax + 2']} />
              <Tooltip contentStyle={{ background: 'rgb(var(--adlr-anthracite))', border: '1px solid rgb(var(--text) / 0.12)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: 'rgb(var(--text))' }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-white/30 text-center py-8">{t('Noch keine Daten für {what}. Trage Werte ein.', { what: t(selectedMeasureMeta.label) })}</p>
        )}

        {showAdd && (
          <div className="mt-4 space-y-3 adlr-fade-in">
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('Gewicht (kg)')}><Input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></Field>
              <Field label={t('Taille (cm)')}><Input type="number" value={form.waist} onChange={(e) => setForm({ ...form, waist: e.target.value })} /></Field>
              <Field label={t('Brust (cm)')}><Input type="number" value={form.chest} onChange={(e) => setForm({ ...form, chest: e.target.value })} /></Field>
              <Field label={t('Hüfte (cm)')}><Input type="number" value={form.hips} onChange={(e) => setForm({ ...form, hips: e.target.value })} /></Field>
              <Field label={t('Arme (cm)')}><Input type="number" value={form.arm} onChange={(e) => setForm({ ...form, arm: e.target.value })} /></Field>
              <Field label={t('Oberschenkel (cm)')}><Input type="number" value={form.thigh} onChange={(e) => setForm({ ...form, thigh: e.target.value })} /></Field>
            </div>
            <Button onClick={addEntry} className="w-full">{t('Speichern')}</Button>
          </div>
        )}
      </Card>

      {/* Body measurements overview */}
      {latest && (
        <Card className="mb-5">
          <p className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2"><Ruler size={16} className="text-adlr-gold" /> {t('Körpermaße (aktuell)')}</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Measure label="Gewicht" value={latest.weight_kg} unit="kg" />
            <Measure label="Taille" value={latest.waist_cm} unit="cm" />
            <Measure label="Brust" value={latest.chest_cm} unit="cm" />
            <Measure label="Hüfte" value={latest.hips_cm} unit="cm" />
            <Measure label="Arme" value={latest.arm_cm} unit="cm" />
            <Measure label="Oberschenkel" value={latest.thigh_cm} unit="cm" />
          </div>
        </Card>
      )}

      {/* Training performance trends */}
      <Card className="mb-5">
        <p className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2"><TrendingUp size={16} className="text-adlr-gold" /> {t('Kraftentwicklung')}</p>
        <ExerciseProgress setLogs={setLogs} completions={completions} />
      </Card>

      {/* PRs */}
      <Card className="mb-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0"><PersonalRecords prs={prs} initiallyOpen /></div>
          <button onClick={() => setShowPr(!showPr)} className="text-adlr-gold text-sm flex items-center gap-1 adlr-tap shrink-0 pt-0.5"><Plus size={14} /> PR</button>
        </div>
        {showPr && (
          <div className="mt-4 space-y-2 adlr-fade-in">
            <select value={prForm.name} onChange={(e) => setPrForm({ ...prForm, name: e.target.value })} className="w-full bg-inset border border-white/10 rounded-xl px-4 py-3 text-white text-sm">
              {['Bankdrücken', 'Kniebeuge', 'Kreuzheben', 'Sonstiges'].map((o) => <option key={o} value={o}>{t(o)}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder={t('Gewicht (kg)')} value={prForm.weight} onChange={(e) => setPrForm({ ...prForm, weight: e.target.value })} />
              <Input type="number" placeholder={t('Wiederholungen')} value={prForm.reps} onChange={(e) => setPrForm({ ...prForm, reps: e.target.value })} />
            </div>
            <Button onClick={addPr} className="w-full">{t('PR speichern')}</Button>
          </div>
        )}
      </Card>

      {/* Progress photos */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-white/80 flex items-center gap-2"><Camera size={16} className="text-adlr-gold" /> {t('Fortschrittsfotos')}</p>
          <label className="text-adlr-gold text-sm flex items-center gap-1 adlr-tap cursor-pointer">
            <Plus size={14} /> {t('Foto')}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
          </label>
        </div>
        {photos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((ph) => (
              <PhotoThumb key={ph.id} photo={ph} />
            ))}
          </div>
        ) : <p className="text-sm text-white/30">{t('Lade Fotos hoch, um deinen Wandel zu dokumentieren.')}</p>}
      </Card>
    </div>
  );
}

function Measure({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div>
      <p className="text-lg font-bold text-white">{value ? value : '—'}</p>
      <p className="text-[10px] text-white/40 uppercase">{t(label)} {value ? unit : ''}</p>
    </div>
  );
}

function PhotoThumb({ photo }: { photo: ProgressPhoto }) {
  return (
    <div className="aspect-square rounded-lg overflow-hidden bg-inset">
      <SignedPhoto path={photo.storage_path} />
    </div>
  );
}
