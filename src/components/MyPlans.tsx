import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Pencil, Trash2, Check, ChevronRight, ArrowLeft, Crown, Dumbbell } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { haptic } from '@/lib/haptics';
import type { Exercise, PlanDay } from '@/lib/types';
import ClientDayEditor from '@/components/ClientDayEditor';

/** Free accounts (no coach, no Pro) may own this many personal plans. */
export const FREE_PLAN_LIMIT = 3;
const MAX_DAYS = 7;

interface PlanRow { id: string; name: string; created_at: string }

export const isProActive = (proUntil?: string | null) => !!proUntil && new Date(proUntil).getTime() > Date.now();

/**
 * "Meine Pläne": athletes build their own plans (client owns the plan row, so plans /
 * plan_days RLS lets them write it directly). Without a coach and without Pro the
 * server allows FREE_PLAN_LIMIT plans (trigger raises 'plan_limit'); with a coach there
 * is no limit.
 */
export default function MyPlans({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { profile } = useAuth();
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [starterId, setStarterId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const unlimited = !!profile?.trainer_id || isProActive(profile?.pro_until);
  const atLimit = !unlimited && (plans?.length ?? 0) >= FREE_PLAN_LIMIT;

  const load = async () => {
    if (!profile) return;
    const [p, cp, sp] = await Promise.all([
      supabase.from('plans').select('id, name, created_at').eq('trainer_id', profile.id).eq('is_personal', true).order('created_at'),
      supabase.from('client_plans').select('plan_id').eq('client_id', profile.id).eq('is_active', true).maybeSingle(),
      supabase.from('plans').select('id').eq('is_starter', true).limit(1).maybeSingle(),
    ]);
    setPlans(p.error ? [] : ((p.data ?? []) as PlanRow[]));
    setActiveId((cp.data as { plan_id: string } | null)?.plan_id ?? null);
    setStarterId((sp.data as { id: string } | null)?.id ?? null);
  };
  useEffect(() => { load(); }, [profile?.id]);

  const activate = async (planId: string) => {
    if (!profile) return;
    setBusy(planId);
    const { error } = await supabase.from('client_plans').upsert(
      { client_id: profile.id, plan_id: planId, is_active: true, assigned_at: new Date().toISOString() },
      { onConflict: 'client_id,plan_id' },
    );
    if (!error) await supabase.from('client_plans').update({ is_active: false }).eq('client_id', profile.id).neq('plan_id', planId);
    setBusy(null);
    setActiveId(planId);
    haptic.success();
    onChanged();
  };

  const create = async () => {
    if (!profile || atLimit) return;
    setBusy('new'); setMsg(null);
    const n = (plans?.length ?? 0) + 1;
    const { data, error } = await supabase.from('plans')
      .insert({ trainer_id: profile.id, name: n === 1 ? t('Mein Plan') : `${t('Mein Plan')} ${n}`, is_template: false, is_personal: true })
      .select('id').single();
    if (error || !data) {
      setBusy(null);
      setMsg(/plan_limit/.test(error?.message ?? '') ? t('Du hast bereits {n} Pläne. Mit ADLR Pro werden es unbegrenzt.', { n: FREE_PLAN_LIMIT }) : t('Plan konnte nicht erstellt werden.'));
      return;
    }
    await supabase.from('plan_days').insert({ plan_id: data.id, day_of_week: 0, workout_name: `${t('Tag')} 1`, difficulty: 1, exercises: [], is_rest_day: false });
    setBusy(null);
    await load();
    setEditing(data.id);
  };

  const remove = async (planId: string) => {
    if (!profile) return;
    if (confirmDel !== planId) { setConfirmDel(planId); setTimeout(() => setConfirmDel((c) => (c === planId ? null : c)), 3000); return; }
    setBusy(planId);
    // keep the workout names in the history: completions point to the days with ON DELETE SET NULL
    const { data: days } = await supabase.from('plan_days').select('id, workout_name').eq('plan_id', planId);
    for (const d of (days ?? []) as { id: string; workout_name: string | null }[]) {
      if (d.workout_name) await supabase.from('workout_completions').update({ title: d.workout_name }).eq('plan_day_id', d.id).is('title', null);
    }
    if (activeId === planId) await supabase.from('client_plans').update({ is_active: false }).eq('client_id', profile.id).eq('plan_id', planId);
    await supabase.from('plan_days').delete().eq('plan_id', planId);
    await supabase.from('plans').delete().eq('id', planId);
    setBusy(null); setConfirmDel(null);
    if (activeId === planId) { setActiveId(null); onChanged(); }
    await load();
  };

  if (editing) return <PlanEditor planId={editing} onBack={() => { setEditing(null); load(); if (editing === activeId) onChanged(); }} />;

  return createPortal(
    <div className="fixed inset-0 z-[64] flex flex-col bg-adlr-black adlr-fade-in" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-md w-full mx-auto flex flex-col flex-1 min-h-0 px-4">
        <div className="flex items-center justify-between py-4 gap-3">
          <div>
            <p className="text-lg font-semibold text-white">{t('Meine Pläne')}</p>
            <p className="text-xs text-white/45">{unlimited ? t('Unbegrenzt') : t('{n} von {max} Plänen', { n: plans?.length ?? 0, max: FREE_PLAN_LIMIT })}</p>
          </div>
          <button onClick={onClose} className="adlr-tap p-2 rounded-xl bg-white/5 text-white/60" aria-label={t('Schließen')}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto pb-6 space-y-2.5">
          {plans === null ? null : plans.length === 0 && (
            <p className="text-sm text-white/50 leading-relaxed py-2">{t('Bau dir deinen eigenen Plan: Trainingstage anlegen, Übungen aus der Bibliothek wählen, Sätze und Wiederholungen festlegen.')}</p>
          )}
          {(plans ?? []).map((p) => {
            const active = p.id === activeId;
            return (
              <div key={p.id} className="adlr-card p-4" style={active ? { borderColor: 'rgb(var(--adlr-gold) / 0.45)' } : undefined}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(var(--adlr-gold) / 0.12)' }}><Dumbbell size={17} className="text-adlr-gold" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-white truncate">{p.name}</p>
                    {active && <p className="text-xs text-adlr-gold flex items-center gap-1"><Check size={12} /> {t('Aktiv')}</p>}
                  </div>
                  <button onClick={() => setEditing(p.id)} className="adlr-tap p-2 rounded-lg bg-white/5 text-white/60" aria-label={t('Bearbeiten')}><Pencil size={15} /></button>
                  <button onClick={() => remove(p.id)} disabled={busy === p.id} className="adlr-tap p-2 rounded-lg" aria-label={t('Löschen')}
                    style={confirmDel === p.id ? { background: 'rgb(239 68 68 / 0.15)', color: 'rgb(248 113 113)' } : { background: 'rgb(var(--text) / 0.05)', color: 'rgb(var(--text) / 0.45)' }}>
                    {confirmDel === p.id ? <Check size={15} /> : <Trash2 size={15} />}
                  </button>
                </div>
                {!active && (
                  <button onClick={() => activate(p.id)} disabled={busy === p.id} className="adlr-tap w-full mt-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'rgb(var(--adlr-gold) / 0.12)', color: 'rgb(var(--adlr-gold))', border: '1px solid rgb(var(--adlr-gold) / 0.3)' }}>
                    {busy === p.id ? '…' : t('Diesen Plan nutzen')}
                  </button>
                )}
              </div>
            );
          })}

          {starterId && starterId !== activeId && (
            <button onClick={() => activate(starterId)} className="adlr-tap w-full adlr-card p-4 flex items-center gap-3 text-left">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{t('Starter-Plan')}</p>
                <p className="text-xs text-white/45">{t('Ganzkörper, 3 Tage, für den Einstieg')}</p>
              </div>
              <ChevronRight size={16} className="text-white/35" />
            </button>
          )}

          {atLimit ? (
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, rgb(var(--adlr-gold) / 0.14), rgb(var(--adlr-gold) / 0.04))', border: '1px solid rgb(var(--adlr-gold) / 0.35)' }}>
              <p className="text-sm font-semibold text-white flex items-center gap-2"><Crown size={15} className="text-adlr-gold" /> {t('Unbegrenzte Pläne mit ADLR Pro')}</p>
              <p className="text-xs text-white/55 mt-1 leading-relaxed">{t('Kostenlos kannst du {n} eigene Pläne anlegen. ADLR Pro kommt bald, oder du trainierst mit einem Coach: dann ist alles inklusive.', { n: FREE_PLAN_LIMIT })}</p>
            </div>
          ) : (
            <button onClick={create} disabled={busy === 'new'} className="adlr-tap w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
              <Plus size={16} /> {busy === 'new' ? '…' : t('Neuer Plan')}
            </button>
          )}
          {msg && <p className="text-xs text-red-400 text-center">{msg}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Edits one personal plan: name, training days (rotation order) and each day's exercises. */
function PlanEditor({ planId, onBack }: { planId: string; onBack: () => void }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState<PlanDay[]>([]);
  const [editDay, setEditDay] = useState<PlanDay | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = async () => {
    const [p, d] = await Promise.all([
      supabase.from('plans').select('name').eq('id', planId).single(),
      supabase.from('plan_days').select('*').eq('plan_id', planId).order('day_of_week'),
    ]);
    setName((p.data as { name: string } | null)?.name ?? '');
    setDays(((d.data ?? []) as PlanDay[]).filter((x) => !x.is_rest_day));
  };
  useEffect(() => { load(); }, [planId]);

  const saveName = async () => { if (name.trim()) await supabase.from('plans').update({ name: name.trim().slice(0, 60) }).eq('id', planId); };
  const renameDay = async (day: PlanDay, v: string) => {
    setDays((arr) => arr.map((x) => (x.id === day.id ? { ...x, workout_name: v } : x)));
  };
  const saveDayName = async (day: PlanDay) => { await supabase.from('plan_days').update({ workout_name: (day.workout_name ?? '').trim().slice(0, 60) || `${t('Tag')} ${day.day_of_week + 1}` }).eq('id', day.id); };
  const addDay = async () => {
    if (days.length >= MAX_DAYS) return;
    const dow = days.length ? Math.max(...days.map((x) => x.day_of_week)) + 1 : 0;
    await supabase.from('plan_days').insert({ plan_id: planId, day_of_week: dow, workout_name: `${t('Tag')} ${days.length + 1}`, difficulty: 1, exercises: [], is_rest_day: false });
    load();
  };
  const removeDay = async (day: PlanDay) => {
    if (confirmDel !== day.id) { setConfirmDel(day.id); setTimeout(() => setConfirmDel((c) => (c === day.id ? null : c)), 3000); return; }
    if (day.workout_name) await supabase.from('workout_completions').update({ title: day.workout_name }).eq('plan_day_id', day.id).is('title', null);
    await supabase.from('plan_days').delete().eq('id', day.id);
    setConfirmDel(null);
    load();
  };
  const saveExercises = (day: PlanDay) => async (exercises: Exercise[]) => {
    const { error } = await supabase.from('plan_days').update({ exercises }).eq('id', day.id);
    return error ? t('Speichern fehlgeschlagen. Bitte versuche es erneut.') : null;
  };

  return createPortal(
    <div className="fixed inset-0 z-[64] flex flex-col bg-adlr-black adlr-fade-in" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-md w-full mx-auto flex flex-col flex-1 min-h-0 px-4">
        <div className="flex items-center gap-3 py-4">
          <button onClick={() => { saveName(); onBack(); }} className="adlr-tap p-2 rounded-xl bg-white/5 text-white/60" aria-label={t('Zurück')}><ArrowLeft size={18} /></button>
          <p className="text-lg font-semibold text-white">{t('Plan bearbeiten')}</p>
        </div>
        <div className="flex-1 overflow-y-auto pb-6 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/40">{t('Name')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} maxLength={60}
              className="w-full mt-1.5 bg-inset border border-white/10 rounded-xl px-4 py-3 text-white outline-none" />
          </label>
          <p className="text-xs text-white/40 leading-relaxed">{t('Die Trainingstage laufen der Reihe nach, unabhängig vom Wochentag.')}</p>
          {days.map((d) => (
            <div key={d.id} className="adlr-card p-4">
              <div className="flex items-center gap-2">
                <input value={d.workout_name ?? ''} onChange={(e) => renameDay(d, e.target.value)} onBlur={() => saveDayName(d)} maxLength={60}
                  className="flex-1 min-w-0 bg-transparent text-base font-semibold text-white outline-none border-b border-transparent focus:border-white/15 py-1" />
                {days.length > 1 && (
                  <button onClick={() => removeDay(d)} className="adlr-tap p-2 rounded-lg" aria-label={t('Tag löschen')}
                    style={confirmDel === d.id ? { background: 'rgb(239 68 68 / 0.15)', color: 'rgb(248 113 113)' } : { color: 'rgb(var(--text) / 0.35)' }}>
                    {confirmDel === d.id ? <Check size={15} /> : <Trash2 size={15} />}
                  </button>
                )}
              </div>
              <p className="text-xs text-white/45 mt-1">
                {d.exercises?.length ? d.exercises.map((e) => t(e.name)).slice(0, 4).join(' · ') + (d.exercises.length > 4 ? ` +${d.exercises.length - 4}` : '') : t('Noch keine Übungen')}
              </p>
              <button onClick={() => setEditDay(d)} className="adlr-tap w-full mt-3 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'rgb(var(--text) / 0.05)', color: 'rgb(var(--text) / 0.85)', border: '1px solid rgb(var(--text) / 0.1)' }}>
                {d.exercises?.length ? t('Übungen bearbeiten') : t('Übungen hinzufügen')}
              </button>
            </div>
          ))}
          {days.length < MAX_DAYS && (
            <button onClick={addDay} className="adlr-tap w-full py-3 rounded-2xl text-sm font-medium border border-dashed flex items-center justify-center gap-2"
              style={{ borderColor: 'rgb(var(--text) / 0.18)', color: 'rgb(var(--text) / 0.7)' }}>
              <Plus size={15} /> {t('Trainingstag hinzufügen')}
            </button>
          )}
        </div>
      </div>
      {editDay && <ClientDayEditor day={editDay} saveExercises={saveExercises(editDay)} onClose={() => setEditDay(null)} onSaved={() => { setEditDay(null); load(); }} />}
    </div>,
    document.body,
  );
}
