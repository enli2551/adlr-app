import { useEffect, useRef, useState } from 'react';
import { useAuth, useCoachName } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Session, WeeklyMessage } from '@/lib/types';
import { Card, SectionHeader, Loading, Button, Input } from '@/components/ui';
import MyPackageCard from '@/components/business/MyPackageCard';
import { Calendar, Sparkles, Gem, Check } from 'lucide-react';
import { t, fmtDate, fmtTime } from '@/lib/i18n';
import { useChatThread } from '@/lib/chat';
import { KIND_LABEL, fmtEUR, type Package } from '@/lib/business';

type Offer = Package;

export default function CoachScreen() {
  const { profile } = useAuth();
  const coach = useCoachName();
  const { messages, loading, send } = useChatThread(profile?.id);
  const [nextSession, setNextSession] = useState<Session | null>(null);
  const [weekly, setWeekly] = useState<WeeklyMessage | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [s, w, p, u] = await Promise.all([
        supabase.from('sessions').select('*').eq('client_id', profile.id).neq('status', 'cancelled').gte('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('weekly_messages').select('*').eq('client_id', profile.id).maybeSingle(),
        // Only the client's own trainer's offers (RLS: trainer_id = my_trainer()).
        profile.trainer_id
          ? supabase.from('packages').select('*').eq('trainer_id', profile.trainer_id).eq('active', true).order('price', { ascending: true })
          : Promise.resolve({ data: [] }),
        supabase.from('upsell_requests').select('upgrade_key').eq('client_id', profile.id).eq('status', 'pending'),
      ]);
      setNextSession(s.data as Session | null);
      setWeekly(w.data as WeeklyMessage | null);
      setOffers(((p.data ?? []) as Offer[]).filter((o) => o.show_to_clients !== false));
      setRequested(new Set(((u.data ?? []) as { upgrade_key: string }[]).map((r) => r.upgrade_key)));
    })();
  }, [profile?.id, profile?.trainer_id]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  const submit = async () => {
    if (!text.trim()) return;
    setSending(true);
    if (await send('client', text)) setText('');
    setSending(false);
  };

  const request = async (o: Offer) => {
    if (!profile) return;
    setRequested((prev) => new Set(prev).add(o.name));
    // package_id exists after 20261002_realtime_chat.sql — retry without it on older schemas.
    const { error } = await supabase.from('upsell_requests').insert({ client_id: profile.id, upgrade_key: o.name, package_id: o.id });
    if (error) await supabase.from('upsell_requests').insert({ client_id: profile.id, upgrade_key: o.name });
  };

  if (loading) return <Loading />;

  return (
    <div className="adlr-fade-in">
      <SectionHeader title={t('Mein Coach')} subtitle={t('{coach} ist für dich da.', { coach })} />

      {/* Chat first — it's the reason to open this tab. */}
      <Card className="p-0 overflow-hidden mb-4">
        <p className="text-sm font-medium text-white/80 px-5 pt-5 mb-2">{t('Nachricht an {coach}', { coach })}</p>
        <div ref={scrollRef} className="h-72 overflow-y-auto px-5 py-3 space-y-3">
          {messages.length === 0 && <p className="text-sm text-white/30 text-center py-8">{t('Schreib {coach} — du bekommst eine Antwort.', { coach })}</p>}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${m.sender === 'client' ? 'bg-adlr-gold text-black rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'}`}>
                {m.body}
                <span className={`block text-[10px] mt-1 ${m.sender === 'client' ? 'text-black/50' : 'text-white/30'}`}>{fmtTime(m.sent_at)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 p-3 border-t border-white/5">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Nachricht...')} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <Button onClick={submit} disabled={sending || !text.trim()} className="px-4">{t('Senden')}</Button>
        </div>
      </Card>

      {/* Next session */}
      <Card className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <Calendar size={18} className="text-adlr-gold" />
          <p className="text-sm font-medium text-white/80">{t('Nächste Session')}</p>
        </div>
        {nextSession ? (
          <div>
            <p className="text-lg font-bold text-white">{fmtDate(nextSession.scheduled_at, { weekday: 'long', day: '2-digit', month: 'long' })}</p>
            <p className="text-sm text-white/60">{t('{time} Uhr', { time: fmtTime(nextSession.scheduled_at) })} · {t(nextSession.location)}</p>
          </div>
        ) : <p className="text-sm text-white/40">{t('Noch keine Session geplant.')}</p>}
      </Card>

      {weekly && (
        <Card className="mb-4 adlr-gold-border bg-gradient-to-br from-adlr-gold/5 to-transparent">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-adlr-gold" />
            <p className="text-xs text-adlr-gold/80 uppercase tracking-wide">{t('Wöchentliche Nachricht')}</p>
          </div>
          <p className="text-sm text-white/90 leading-relaxed">{weekly.body}</p>
        </Card>
      )}

      {profile && <MyPackageCard clientId={profile.id} />}

      {/* Extras: the trainer's own price list, not a hardcoded one. */}
      {offers.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Gem size={12} /> {t('Extras von {coach}', { coach })}</p>
          <div className="space-y-3">
            {offers.map((o) => {
              const isRequested = requested.has(o.name);
              const unit = o.kind === 'subscription' ? t(' / Monat') : o.kind === 'single' ? t(' / Einheit') : '';
              return (
                <div key={o.id} className="adlr-card adlr-gold-border p-5">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <p className="text-sm font-bold text-white">{o.name}</p>
                    <span className="text-[11px] text-white/40 shrink-0">{t(KIND_LABEL[o.kind])}</span>
                  </div>
                  {o.description && <p className="text-sm text-white/60 leading-relaxed">{o.description}</p>}
                  {o.kind === 'pack' && o.sessions_included ? (
                    <p className="text-xs text-white/50 mt-1">{t('{n} Einheiten', { n: o.sessions_included })}{o.validity_weeks ? ` · ${t('{w} Wochen gültig', { w: o.validity_weeks })}` : ''}</p>
                  ) : null}
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-lg font-bold text-white">{fmtEUR(Number(o.price))}<span className="text-xs text-white/40 font-normal">{unit}</span></p>
                    <Button variant={isRequested ? 'ghost' : 'gold-outline'} onClick={() => request(o)} disabled={isRequested} className="text-sm">
                      {isRequested ? <span className="flex items-center gap-1.5"><Check size={14} /> {t('Angefragt')}</span> : t('Anfragen')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
