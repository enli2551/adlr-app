import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Session, Profile } from '@/lib/types';
import { SectionHeader, Loading, Card, Button, Input, Field } from '@/components/ui';
import { Plus, X, MapPin, Clock } from 'lucide-react';

const LOCATIONS = ['Powergym Kottingbrunn', 'Online', 'Sonstiges'];
const CLIENT_COLORS = ['rgb(var(--adlr-gold))', '#8B0000', '#3a7a5a', '#5a5a8a', '#8a6a3a'];

function getWeekStart(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay() + 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function CalendarScreen() {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clients, setClients] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ clientId: '', date: '', time: '10:00', location: LOCATIONS[0], duration: 60 });

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
    const [s, c] = await Promise.all([
      supabase.from('sessions').select('*').eq('trainer_id', profile.id).gte('scheduled_at', weekStart.toISOString()).lt('scheduled_at', weekEnd.toISOString()).order('scheduled_at'),
      supabase.from('profiles').select('*').eq('role', 'client').eq('trainer_id', profile.id),
    ]);
    setSessions((s.data ?? []) as Session[]);
    setClients((c.data ?? []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id, weekStart]);

  const addSession = async () => {
    if (!profile || !form.clientId || !form.date) return;
    const dt = new Date(`${form.date}T${form.time}:00`);
    await supabase.from('sessions').insert({
      client_id: form.clientId, trainer_id: profile.id, scheduled_at: dt.toISOString(),
      duration_min: Number(form.duration), location: form.location,
    });
    setForm({ clientId: '', date: '', time: '10:00', location: LOCATIONS[0], duration: 60 });
    setShowAdd(false);
    load();
  };

  const cancelSession = async (id: string) => {
    await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', id);
    load();
  };

  const completeSession = async (id: string) => {
    await supabase.from('sessions').update({ status: 'completed' }).eq('id', id);
    load();
  };

  if (loading) return <Loading />;

  const days = [...Array(7)].map((_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    return d;
  });
  const clientColor = (id: string) => CLIENT_COLORS[clients.findIndex((c) => c.id === id) % CLIENT_COLORS.length];
  const clientName = (id: string) => { const c = clients.find((x) => x.id === id); return c ? `${c.first_name} ${c.last_name}` : '—'; };

  return (
    <div className="adlr-fade-in">
      <SectionHeader title="Kalender" subtitle="Deine Woche." />

      {/* Week nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }} className="adlr-tap px-3 py-2 rounded-lg bg-white/5 text-white/60 text-sm">‹</button>
        <p className="text-sm text-white/70">{weekStart.toLocaleDateString('de-AT', { day: '2-digit', month: 'short' })} — {new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString('de-AT', { day: '2-digit', month: 'short' })}</p>
        <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }} className="adlr-tap px-3 py-2 rounded-lg bg-white/5 text-white/60 text-sm">›</button>
      </div>

      <Button onClick={() => setShowAdd(!showAdd)} className="w-full mb-4"><Plus size={16} className="inline mr-1" /> Session hinzufügen</Button>

      {showAdd && (
        <Card className="mb-4 space-y-3 adlr-fade-in">
          <Field label="Klient">
            {clients.length === 0 ? (
              <p className="text-xs text-white/40 py-1">Noch keine Klienten vorhanden.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {clients.map((c) => {
                  const on = form.clientId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForm({ ...form, clientId: c.id })}
                      className="adlr-tap px-3 py-2 rounded-xl text-sm border transition-all"
                      style={on
                        ? { background: 'rgb(var(--adlr-gold))', color: '#000', borderColor: 'rgb(var(--adlr-gold))', fontWeight: 600 }
                        : { background: 'rgb(var(--text) / 0.05)', color: 'rgb(var(--text) / 0.8)', borderColor: 'rgb(var(--text) / 0.12)' }}
                    >
                      {c.first_name} {c.last_name}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Datum"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Uhrzeit"><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Dauer (Min)"><Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Ort">
              <div className="flex flex-wrap gap-2">
                {LOCATIONS.map((l) => {
                  const on = form.location === l;
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setForm({ ...form, location: l })}
                      className="adlr-tap px-3 py-2 rounded-xl text-xs border transition-all"
                      style={on
                        ? { background: 'rgb(var(--adlr-gold))', color: '#000', borderColor: 'rgb(var(--adlr-gold))', fontWeight: 600 }
                        : { background: 'rgb(var(--text) / 0.05)', color: 'rgb(var(--text) / 0.8)', borderColor: 'rgb(var(--text) / 0.12)' }}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </Field>
          <Button onClick={addSession} className="w-full">Speichern</Button>
        </Card>
      )}

      {/* Week view */}
      <div className="space-y-3">
        {days.map((d, i) => {
          const daySessions = sessions.filter((s) => new Date(s.scheduled_at).toDateString() === d.toDateString());
          return (
            <div key={i}>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-medium text-white/70">{d.toLocaleDateString('de-AT', { weekday: 'long' })}</p>
                <span className="text-xs text-white/30">{d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}</span>
              </div>
              {daySessions.length === 0 ? (
                <div className="h-10 rounded-lg border border-dashed border-white/5" />
              ) : (
                <div className="space-y-2">
                  {daySessions.map((s) => (
                    <div key={s.id} className={`adlr-card p-3 flex items-center gap-3 ${s.status === 'cancelled' ? 'opacity-40' : ''}`} style={{ borderLeftColor: clientColor(s.client_id), borderLeftWidth: 3 }}>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{clientName(s.client_id)}</p>
                        <div className="flex items-center gap-3 text-xs text-white/40 mt-0.5">
                          <span className="flex items-center gap-1"><Clock size={11} /> {new Date(s.scheduled_at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="flex items-center gap-1"><MapPin size={11} /> {s.location}</span>
                        </div>
                      </div>
                      {s.status === 'scheduled' && (
                        <div className="flex gap-1">
                          <button onClick={() => completeSession(s.id)} className="adlr-tap text-xs px-2 py-1 rounded-md bg-adlr-gold/10 text-adlr-gold border border-adlr-gold/30">Fertig</button>
                          <button onClick={() => cancelSession(s.id)} className="adlr-tap text-xs px-2 py-1 rounded-md bg-white/5 text-white/40">Abbrechen</button>
                        </div>
                      )}
                      {s.status === 'completed' && <span className="text-xs text-adlr-gold">Erledigt</span>}
                      {s.status === 'cancelled' && <span className="text-xs text-red-400/60">Abgesagt</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
