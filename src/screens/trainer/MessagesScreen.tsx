import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useIsDesktop } from '@/lib/useMediaQuery';
import type { Profile, UpsellRequest } from '@/lib/types';
import { SectionHeader, Loading, Card, Button, Input } from '@/components/ui';
import { ArrowLeft, Star, MessageSquare } from 'lucide-react';
import { t, fmtTime, fmtDate } from '@/lib/i18n';
import { useChatThread } from '@/lib/chat';

const TEMPLATES = [
  'Alles klar. Wir machen das.',
  'Gute Arbeit heute. Bleib dran.',
  'Ruh dich aus. Morgen wird hart.',
  'Vergiss dein Wasser nicht.',
];

export default function MessagesScreen() {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Profile[]>([]);
  const [upsells, setUpsells] = useState<UpsellRequest[]>([]);
  const [params] = useSearchParams();
  // ?client=<id> opens that thread directly (push notification tap).
  const [activeClient, setActiveClient] = useState<string | null>(() => params.get('client'));
  const { messages, send: sendMessage } = useChatThread(activeClient);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [last, setLast] = useState<Map<string, { body: string; sender: string; sent_at: string }>>(new Map());
  const seenKey = (id: string) => `adlr_thread_seen_${id}`;
  const seenAt = (id: string) => { try { return Number(localStorage.getItem(seenKey(id)) || 0); } catch { return 0; } };
  const openThread = (id: string | null) => {
    if (id) { try { localStorage.setItem(seenKey(id), String(Date.now())); } catch { /* ignore */ } }
    setActiveClient(id);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const [c, u] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'client').eq('trainer_id', profile.id).order('first_name'),
      supabase.from('upsell_requests').select('*, profiles!inner(first_name,last_name)').eq('profiles.trainer_id', profile.id).order('created_at', { ascending: false }),
    ]);
    const list = (c.data ?? []) as Profile[];
    setClients(list);
    if (list.length) {
      const { data: ms } = await supabase.from('messages').select('client_id, body, sender, sent_at').in('client_id', list.map((x) => x.id)).order('sent_at', { ascending: false }).limit(400);
      const m = new Map<string, { body: string; sender: string; sent_at: string }>();
      for (const r of (ms ?? []) as { client_id: string; body: string; sender: string; sent_at: string }[]) if (!m.has(r.client_id)) m.set(r.client_id, r);
      setLast(m);
    }
    setUpsells((u.data ?? []) as UpsellRequest[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);
  useEffect(() => { const c = params.get('client'); if (c) setActiveClient(c); }, [params]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);
  // Desktop: opening a thread puts the cursor straight into the reply field.
  useEffect(() => { if (isDesktop && activeClient) document.getElementById('adlr-chat-reply')?.focus(); }, [isDesktop, activeClient, loading]);

  const send = async () => {
    if (!profile || !activeClient || !text.trim()) return;
    if (await sendMessage('trainer', text)) setText('');
  };

  if (loading) return <Loading />;

  // Chat view
  const chatView = (activeClient: string) => {
    const client = clients.find((c) => c.id === activeClient);
    return (
      <div className="adlr-fade-in">
        <button onClick={() => { openThread(activeClient); setActiveClient(null); load(); }} className="flex items-center gap-2 text-white/50 text-sm mb-4 adlr-tap lg:hidden">
          <ArrowLeft size={16} /> {t('Inbox')}
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold font-bold">
            {(client?.first_name?.[0] ?? '?').toUpperCase()}
          </div>
          <p className="font-semibold text-white">{client?.first_name} {client?.last_name}</p>
        </div>
        <Card className="p-0 overflow-hidden">
          <div ref={scrollRef} className="overflow-y-auto px-5 py-3 space-y-3" style={{ height: 'calc(100dvh - 22rem)', minHeight: '16rem' }}>
            {messages.length === 0 && <p className="text-sm text-white/30 text-center py-12">{t('Noch keine Nachrichten.')}</p>}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === 'trainer' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${m.sender === 'trainer' ? 'bg-adlr-gold text-black rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'}`}>
                  {m.body}
                  <span className={`block text-[10px] mt-1 ${m.sender === 'trainer' ? 'text-black/50' : 'text-white/30'}`}>{fmtTime(m.sent_at)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 p-3 border-t border-white/5">
            <Input id="adlr-chat-reply" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Antwort...')} onKeyDown={(e) => e.key === 'Enter' && send()} />
            <Button onClick={send} disabled={!text.trim()} className="px-4">{t('Senden')}</Button>
          </div>
        </Card>
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {TEMPLATES.map((tpl) => (
            <button key={tpl} onClick={() => setText(t(tpl))} className="adlr-tap px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 whitespace-nowrap">{t(tpl)}</button>
          ))}
        </div>
      </div>
    );
  };
  if (activeClient && !isDesktop) return chatView(activeClient);

  // Inbox
  const clientUpsells = (clientId: string) => upsells.filter((u) => u.client_id === clientId);

  const inbox = (
    <div className="adlr-fade-in">
      <SectionHeader title={t('Nachrichten')} subtitle={t('Deine Inbox.')} />

      {/* Upsell highlights */}
      {upsells.filter((u) => u.status === 'pending').length > 0 && (
        <Card className="mb-4 adlr-gold-border">
          <p className="text-xs text-adlr-gold uppercase tracking-wide mb-3 flex items-center gap-1"><Star size={12} /> {t('Upsell-Anfragen')}</p>
          <div className="space-y-2">
            {upsells.filter((u) => u.status === 'pending').map((u) => (
              <div key={u.id} className="flex justify-between items-center text-sm">
                <span className="text-white/80">{(u as unknown as { profiles: { first_name: string } }).profiles?.first_name}</span>
                <span className="text-adlr-gold text-xs">{u.upgrade_key}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {clients.length === 0 ? (
        <p className="text-sm text-white/30 text-center py-12">{t('Noch keine Klienten.')}</p>
      ) : (
        <div className="adlr-card overflow-hidden">
          {[...clients].sort((x, y) => (last.get(y.id)?.sent_at ?? '').localeCompare(last.get(x.id)?.sent_at ?? '')).map((c, i) => {
            const uCount = clientUpsells(c.id).filter((u) => u.status === 'pending').length;
            const lm = last.get(c.id);
            const unread = !!lm && lm.sender === 'client' && new Date(lm.sent_at).getTime() > seenAt(c.id);
            return (
              <button key={c.id} onClick={() => openThread(c.id)} className="adlr-tap w-full flex items-center gap-3 px-4 py-3 text-left" style={{ ...(i > 0 ? { borderTop: '1px solid rgb(var(--text) / 0.05)' } : {}), ...(isDesktop && activeClient === c.id ? { background: 'rgb(var(--adlr-gold) / 0.1)' } : {}) }}>
                <div className="w-10 h-10 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold font-bold overflow-hidden shrink-0">
                  {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : (c.first_name?.[0] ?? '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className={`text-sm truncate flex-1 ${unread ? 'font-bold text-white' : 'font-medium text-white/90'}`}>{c.first_name} {c.last_name}</p>
                    {lm && <span className={`text-[11px] shrink-0 ${unread ? 'text-adlr-gold' : 'text-white/35'}`}>{when(lm.sent_at)}</span>}
                  </div>
                  <p className={`text-xs truncate ${unread ? 'text-white/80' : 'text-white/40'}`}>
                    {uCount > 0 ? <span className="text-adlr-gold">{t(uCount > 1 ? '{n} Upsell-Anfragen' : '{n} Upsell-Anfrage', { n: uCount })} · </span> : null}
                    {lm ? `${lm.sender === 'trainer' ? t('Du') + ': ' : ''}${lm.body.replace(/\s+/g, ' ')}` : t('Noch keine Nachrichten.')}
                  </p>
                </div>
                {unread && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: 'rgb(var(--adlr-gold))' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  if (!isDesktop) return inbox;

  // Desktop: inbox and the open conversation side by side.
  return (
    <div className="grid grid-cols-[minmax(280px,360px)_minmax(0,1fr)] gap-8 items-start">
      <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 -mr-2">{inbox}</div>
      <div className="min-w-0 lg:pt-1">
        {activeClient ? chatView(activeClient) : (
          <div className="adlr-card p-10 text-center adlr-fade-in">
            <MessageSquare size={32} className="mx-auto mb-3 text-white/15" />
            <p className="text-sm text-white/40">{t('Wähle links eine Unterhaltung.')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtTime(iso);
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days < 7) return fmtDate(iso, { weekday: 'short' });
  return fmtDate(iso, { day: 'numeric', month: 'short' });
}
