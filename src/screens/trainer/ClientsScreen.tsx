import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { SectionHeader, Loading, Input } from '@/components/ui';
import { Search, ChevronRight, Users } from 'lucide-react';
import { computeAttention, type AttentionItem } from '@/lib/attention';
import ClientDetail from './ClientDetail';
import { useSearchParams } from 'react-router-dom';
import { t } from '@/lib/i18n';
import { loadWeeklyStreaks } from '@/lib/streak';
import { InviteClientsButton } from '@/components/CoachLink';
import { useIsDesktop } from '@/lib/useMediaQuery';

export default function ClientsScreen() {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [streaks, setStreaks] = useState<Map<string, number>>(new Map());
  // Status per client: the most urgent attention item + the active plan's name
  const [attention, setAttention] = useState<Map<string, AttentionItem>>(new Map());
  const [planName, setPlanName] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention' | 'noplan'>('all');
  const [params, setParams] = useSearchParams();
  const selected = params.get('client');
  const setSelected = (id: string | null) => setParams(id ? { client: id } : {}, { replace: !id });
  const isDesktop = useIsDesktop();

  // quiet = refresh the list in place (desktop keeps it visible next to the detail pane)
  const load = async (quiet = false) => {
    if (!profile) return;
    if (!quiet) setLoading(true);
    const { data } = await supabase.from('profiles').select('*').eq('role', 'client').eq('trainer_id', profile.id).order('created_at', { ascending: false });
    const list = (data ?? []) as Profile[];
    setClients(list);
    setLoading(false);
    loadWeeklyStreaks(list.map((c) => c.id)).then(setStreaks).catch(() => {});
    computeAttention(list).then((items) => {
      const m = new Map<string, AttentionItem>();
      for (const a of [...items].sort((x, y) => y.severity - x.severity)) if (!m.has(a.client.id)) m.set(a.client.id, a);
      setAttention(m);
    }).catch(() => {});
    if (list.length) {
      const { data: cps } = await supabase.from('client_plans').select('client_id, plan_id').eq('is_active', true).in('client_id', list.map((c) => c.id));
      const ids = [...new Set(((cps ?? []) as { plan_id: string }[]).map((r) => r.plan_id))];
      const { data: pls } = ids.length ? await supabase.from('plans').select('id, name').in('id', ids) : { data: [] };
      const nameById = new Map(((pls ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
      setPlanName(new Map(((cps ?? []) as { client_id: string; plan_id: string }[]).map((r) => [r.client_id, nameById.get(r.plan_id) ?? ''])));
    }
  };

  useEffect(() => { load(); }, [profile?.id]);

  if (loading) return <Loading />;
  const detail = selected ? <ClientDetail key={selected} clientId={selected} onBack={() => { setSelected(null); load(isDesktop); }} /> : null;
  if (detail && !isDesktop) return detail;

  const noPlan = (c: Profile) => c.intake_completed && !planName.has(c.id);
  const filtered = clients.filter((c) => {
    const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase();
    if (!name.includes(query.toLowerCase())) return false;
    if (filter === 'attention') return attention.has(c.id);
    if (filter === 'noplan') return noPlan(c);
    return true;
  }).sort((x, y) => (attention.get(y.id)?.severity ?? 0) - (attention.get(x.id)?.severity ?? 0));
  const counts = { attention: clients.filter((c) => attention.has(c.id)).length, noplan: clients.filter(noPlan).length };
  const ago = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return d <= 0 ? t('heute aktiv') : d === 1 ? t('gestern aktiv') : t('vor {n} Tagen aktiv', { n: d });
  };

  const list = (
    <div className="adlr-fade-in">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader title={t('Klienten')} subtitle={t('{n} aktiv', { n: clients.length })} />
        <div className="mt-1 shrink-0"><InviteClientsButton /></div>
      </div>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Suchen...')} className="pl-10" />
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {([['all', t('Alle'), clients.length], ['attention', t('Aufmerksamkeit'), counts.attention], ['noplan', t('Ohne Plan'), counts.noplan]] as const).map(([id, label, n]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`adlr-tap px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-all ${filter === id ? 'bg-adlr-gold text-black border-adlr-gold' : 'bg-white/5 text-white/55 border-white/10'}`}>
            {label} <span className={filter === id ? 'text-black/60' : 'text-white/35'}>{n}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-white/30 text-center py-12">{filter === 'all' ? t('Keine Klienten gefunden.') : t('Niemand in dieser Liste — gut so.')}</p>
      ) : (
        <div className="adlr-card overflow-hidden">
          {filtered.map((c, i) => {
            const att = attention.get(c.id);
            const plan = planName.get(c.id);
            const streak = streaks.get(c.id) ?? 0;
            return (
              <button key={c.id} onClick={() => setSelected(c.id)} className="adlr-tap w-full flex items-center gap-3 px-4 py-3 text-left" style={{ ...(i > 0 ? { borderTop: '1px solid rgb(var(--text) / 0.05)' } : {}), ...(isDesktop && selected === c.id ? { background: 'rgb(var(--adlr-gold) / 0.1)' } : {}) }}>
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold text-sm font-bold overflow-hidden">
                    {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : (c.first_name?.[0] ?? '?').toUpperCase()}
                  </div>
                  {att && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2" style={{ background: att.severity >= 45 ? 'rgb(var(--adlr-gold))' : '#fb923c', borderColor: 'rgb(var(--adlr-anthracite))' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{c.first_name} {c.last_name}</p>
                  {att ? (
                    <p className="text-xs truncate" style={{ color: att.severity >= 45 ? 'rgb(var(--adlr-gold))' : '#fb923c' }}>{att.text}</p>
                  ) : (
                    <p className="text-xs text-white/40 truncate">{[plan || (c.intake_completed ? t('Kein Plan') : t('Onboarding offen')), ago(c.last_active)].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
                {streak > 0 && <span className="text-xs text-white/50 shrink-0">🔥 {streak}</span>}
                <ChevronRight size={15} className="text-white/25 shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  if (!isDesktop) return list;

  // Desktop: client list and the open client side by side.
  return (
    <div className="grid grid-cols-[minmax(300px,380px)_minmax(0,1fr)] gap-8 items-start">
      <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 -mr-2">{list}</div>
      <div className="min-w-0">
        {detail ?? (
          <div className="adlr-card p-10 mt-1 text-center adlr-fade-in">
            <Users size={32} className="mx-auto mb-3 text-white/15" />
            <p className="text-sm text-white/40">{t('Wähle links einen Klienten, um Details zu sehen.')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
