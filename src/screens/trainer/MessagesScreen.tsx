import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useIsDesktop } from '@/lib/useMediaQuery';
import type { Profile, UpsellRequest } from '@/lib/types';
import { SectionHeader, Loading, Card, Button, Input } from '@/components/ui';
import { ArrowLeft, Star, MessageSquare } from 'lucide-react';
import { t, fmtTime } from '@/lib/i18n';
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
  const [activeClient, setActiveClient] = useState<string | null>(null);
  const { messages, send: sendMessage } = useChatThread(activeClient);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const [c, u] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'client').eq('trainer_id', profile.id).order('first_name'),
      supabase.from('upsell_requests').select('*, profiles!inner(first_name,last_name)').eq('profiles.trainer_id', profile.id).order('created_at', { ascending: false }),
    ]);
    setClients((c.data ?? []) as Profile[]);
    setUpsells((u.data ?? []) as UpsellRequest[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);
  // Desktop: opening a thread puts the cursor straight into the reply field.
  useEffect(() => { if (isDesktop && activeClient) document.getElementById('adlr-chat-reply')?.focus(); }, [isDesktop, activeClient]);

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
        <button onClick={() => setActiveClient(null)} className="flex items-center gap-2 text-white/50 text-sm mb-4 adlr-tap lg:hidden">
          <ArrowLeft size={16} /> {t('Inbox')}
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold font-bold">
            {(client?.first_name?.[0] ?? '?').toUpperCase()}
          </div>
          <p className="font-semibold text-white">{client?.first_name} {client?.last_name}</p>
        </div>
        <Card className="p-0 overflow-hidden">
          <div ref={scrollRef} className="h-72 lg:h-[calc(100vh-22rem)] lg:min-h-[18rem] overflow-y-auto px-5 py-3 space-y-3">
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
        <div className="space-y-2">
          {clients.map((c) => {
            const uCount = clientUpsells(c.id).filter((u) => u.status === 'pending').length;
            return (
              <Card key={c.id} onClick={() => setActiveClient(c.id)} className={isDesktop && activeClient === c.id ? 'adlr-gold-border' : ''}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold font-bold">
                    {(c.first_name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{c.first_name} {c.last_name}</p>
                    {uCount > 0 && <p className="text-xs text-adlr-gold">{t(uCount > 1 ? '{n} Upsell-Anfragen' : '{n} Upsell-Anfrage', { n: uCount })}</p>}
                  </div>
                </div>
              </Card>
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
