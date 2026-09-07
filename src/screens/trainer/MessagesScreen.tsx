import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Message, Profile, UpsellRequest } from '@/lib/types';
import { SectionHeader, Loading, Card, Button, Input } from '@/components/ui';
import { ArrowLeft, Star } from 'lucide-react';

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const [c, u] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'client').eq('trainer_id', profile.id).order('first_name'),
      supabase.from('upsell_requests').select('*, profiles(first_name,last_name)').order('created_at', { ascending: false }),
    ]);
    setClients((c.data ?? []) as Profile[]);
    setUpsells((u.data ?? []) as UpsellRequest[]);
    setLoading(false);
  };

  const loadMessages = async (clientId: string) => {
    const { data } = await supabase.from('messages').select('*').eq('client_id', clientId).order('sent_at', { ascending: true });
    setMessages((data ?? []) as Message[]);
  };

  useEffect(() => { load(); }, [profile?.id]);
  useEffect(() => { if (activeClient) loadMessages(activeClient); }, [activeClient]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const send = async () => {
    if (!profile || !activeClient || !text.trim()) return;
    await supabase.from('messages').insert({ client_id: activeClient, sender: 'trainer', body: text.trim() });
    setText('');
    loadMessages(activeClient);
  };

  if (loading) return <Loading />;

  // Chat view
  if (activeClient) {
    const client = clients.find((c) => c.id === activeClient);
    return (
      <div className="adlr-fade-in">
        <button onClick={() => setActiveClient(null)} className="flex items-center gap-2 text-white/50 text-sm mb-4 adlr-tap">
          <ArrowLeft size={16} /> Inbox
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold font-bold">
            {(client?.first_name?.[0] ?? '?').toUpperCase()}
          </div>
          <p className="font-semibold text-white">{client?.first_name} {client?.last_name}</p>
        </div>
        <Card className="p-0 overflow-hidden">
          <div ref={scrollRef} className="h-72 overflow-y-auto px-5 py-3 space-y-3">
            {messages.length === 0 && <p className="text-sm text-white/30 text-center py-12">Noch keine Nachrichten.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === 'trainer' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${m.sender === 'trainer' ? 'bg-adlr-gold text-black rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'}`}>
                  {m.body}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 p-3 border-t border-white/5">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Antwort..." onKeyDown={(e) => e.key === 'Enter' && send()} />
            <Button onClick={send} disabled={!text.trim()} className="px-4">Senden</Button>
          </div>
        </Card>
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {TEMPLATES.map((t) => (
            <button key={t} onClick={() => setText(t)} className="adlr-tap px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 whitespace-nowrap">{t}</button>
          ))}
        </div>
      </div>
    );
  }

  // Inbox
  const clientUpsells = (clientId: string) => upsells.filter((u) => u.client_id === clientId);

  return (
    <div className="adlr-fade-in">
      <SectionHeader title="Nachrichten" subtitle="Deine Inbox." />

      {/* Upsell highlights */}
      {upsells.filter((u) => u.status === 'pending').length > 0 && (
        <Card className="mb-4 adlr-gold-border">
          <p className="text-xs text-adlr-gold uppercase tracking-wide mb-3 flex items-center gap-1"><Star size={12} /> Upsell-Anfragen</p>
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
        <p className="text-sm text-white/30 text-center py-12">Noch keine Klienten.</p>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => {
            const uCount = clientUpsells(c.id).filter((u) => u.status === 'pending').length;
            return (
              <Card key={c.id} onClick={() => setActiveClient(c.id)}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold font-bold">
                    {(c.first_name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{c.first_name} {c.last_name}</p>
                    {uCount > 0 && <p className="text-xs text-adlr-gold">{uCount} Upsell-Anfrage{uCount > 1 ? 'n' : ''}</p>}
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
