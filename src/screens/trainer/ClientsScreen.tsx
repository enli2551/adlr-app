import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile, WorkoutCompletion } from '@/lib/types';
import { SectionHeader, Loading, Card, Input } from '@/components/ui';
import { Search } from 'lucide-react';
import ClientDetail from './ClientDetail';

export default function ClientsScreen() {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Profile[]>([]);
  const [completions, setCompletions] = useState<WorkoutCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [goalFilter, setGoalFilter] = useState('Alle');
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').eq('role', 'client').eq('trainer_id', profile.id).order('created_at', { ascending: false });
    setClients((data ?? []) as Profile[]);
    const { data: wc } = await supabase.from('workout_completions').select('*');
    setCompletions((wc ?? []) as WorkoutCompletion[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

  if (loading) return <Loading />;
  if (selected) return <ClientDetail clientId={selected} onBack={() => { setSelected(null); load(); }} />;

  const goals = ['Alle', 'Gewicht reduzieren', 'Muskeln aufbauen', 'Allgemeine Fitness & Energie'];
  const filtered = clients.filter((c) => {
    const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase();
    const matchQuery = name.includes(query.toLowerCase());
    const matchGoal = goalFilter === 'Alle' || (c.intake?.goals ?? []).includes(goalFilter);
    return matchQuery && matchGoal;
  });

  return (
    <div className="adlr-fade-in">
      <SectionHeader title="Klienten" subtitle={`${clients.length} aktiv`} />

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Suchen..." className="pl-10" />
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {goals.map((g) => (
          <button
            key={g}
            onClick={() => setGoalFilter(g)}
            className={`adlr-tap px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-all ${
              goalFilter === g ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/50 border-white/10'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-white/30 text-center py-12">Keine Klienten gefunden.</p>
      ) : (
        <div className="space-y-3 adlr-stagger">
          {filtered.map((c) => {
            const clientCompletions = completions.filter((wc) => wc.client_id === c.id);
            const lastActive = c.last_active ? new Date(c.last_active).toLocaleDateString('de-AT') : '—';
            const goal = c.intake?.goals?.[0] ?? '—';
            return (
              <Card key={c.id} onClick={() => setSelected(c.id)}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold font-bold overflow-hidden">
                    {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : (c.first_name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm">{c.first_name} {c.last_name}</p>
                    <p className="text-xs text-white/40 truncate">{goal}</p>
                    <p className="text-xs text-white/30">Zuletzt aktiv: {lastActive}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/40">Streak</p>
                    <p className="text-adlr-gold font-bold">{c.streak}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
