import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Message, Session, SessionNote, WeeklyMessage } from '@/lib/types';
import { Card, SectionHeader, Loading, Button, Input } from '@/components/ui';
import { Calendar, FileText, Sparkles } from 'lucide-react';

export default function CoachScreen() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextSession, setNextSession] = useState<Session | null>(null);
  const [lastNote, setLastNote] = useState<SessionNote | null>(null);
  const [weekly, setWeekly] = useState<WeeklyMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const [m, s, n, w] = await Promise.all([
      supabase.from('messages').select('*').eq('client_id', profile.id).order('sent_at', { ascending: true }),
      supabase.from('sessions').select('*').eq('client_id', profile.id).gte('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('session_notes').select('*').eq('client_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('weekly_messages').select('*').eq('client_id', profile.id).maybeSingle(),
    ]);
    setMessages((m.data ?? []) as Message[]);
    setNextSession(s.data as Session | null);
    setLastNote(n.data as SessionNote | null);
    setWeekly(w.data as WeeklyMessage | null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!profile || !text.trim()) return;
    setSending(true);
    await supabase.from('messages').insert({ client_id: profile.id, sender: 'client', body: text.trim() });
    setText('');
    setSending(false);
    load();
  };

  if (loading) return <Loading />;

  return (
    <div className="adlr-fade-in">
      <SectionHeader title="Mein Coach" subtitle="Peter ist für dich da." />

      {/* Next session */}
      <Card className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <Calendar size={18} className="text-adlr-gold" />
          <p className="text-sm font-medium text-white/80">Nächste Session</p>
        </div>
        {nextSession ? (
          <div>
            <p className="text-lg font-bold text-white">{new Date(nextSession.scheduled_at).toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
            <p className="text-sm text-white/60">{new Date(nextSession.scheduled_at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })} Uhr · {nextSession.location}</p>
          </div>
        ) : <p className="text-sm text-white/40">Noch keine Session geplant.</p>}
      </Card>

      {/* Weekly message */}
      {weekly && (
        <Card className="mb-4 adlr-gold-border bg-gradient-to-br from-adlr-gold/5 to-transparent">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-adlr-gold" />
            <p className="text-xs text-adlr-gold/80 uppercase tracking-wide">Wöchentliche Nachricht</p>
          </div>
          <p className="text-sm text-white/90 leading-relaxed">{weekly.body}</p>
        </Card>
      )}

      {/* Last session note */}
      {lastNote && (
        <Card className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={16} className="text-white/50" />
            <p className="text-xs text-white/40 uppercase tracking-wide">Notiz der letzten Session</p>
          </div>
          <p className="text-sm text-white/80 leading-relaxed">{lastNote.body}</p>
        </Card>
      )}

      {/* Chat */}
      <Card className="p-0 overflow-hidden">
        <p className="text-sm font-medium text-white/80 px-5 pt-5 mb-2">Nachricht an Peter</p>
        <div ref={scrollRef} className="h-64 overflow-y-auto px-5 py-3 space-y-3">
          {messages.length === 0 && <p className="text-sm text-white/30 text-center py-8">Schreib Peter. Er antwortet.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender === 'client' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${m.sender === 'client' ? 'bg-adlr-gold text-black rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'}`}>
                {m.body}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 p-3 border-t border-white/5">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nachricht..." onKeyDown={(e) => e.key === 'Enter' && send()} />
          <Button onClick={send} disabled={sending || !text.trim()} className="px-4">Senden</Button>
        </div>
      </Card>
    </div>
  );
}
