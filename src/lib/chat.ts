import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/lib/types';

/**
 * Live chat thread for one client: loads the history, then listens on Supabase
 * Realtime for new rows (needs `messages` in the `supabase_realtime` publication —
 * migration 20261002_realtime_chat.sql). Without realtime it still works, it just
 * shows the other side's messages on the next open. RLS applies to realtime too.
 */
export function useChatThread(clientId: string | null | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) { setMessages([]); return; }
    let cancelled = false;
    setMessages([]);
    setLoading(true);
    supabase.from('messages').select('*').eq('client_id', clientId).order('sent_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setMessages((data ?? []) as Message[]);
        setLoading(false);
      });
    const channel = supabase
      .channel(`chat:${clientId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [clientId]);

  /** Optimistic send — the row appears immediately, realtime echo is de-duplicated by id. */
  const send = useCallback(async (sender: Message['sender'], body: string) => {
    if (!clientId || !body.trim()) return false;
    const { data, error } = await supabase.from('messages')
      .insert({ client_id: clientId, sender, body: body.trim() }).select().single();
    if (error || !data) return false;
    const m = data as Message;
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    return true;
  }, [clientId]);

  return { messages, loading, send };
}

/**
 * Calls `onMessage` for every new message from the other side (client: trainer
 * messages for me; trainer: client messages of my clients — RLS filters the stream).
 * Used for the unread dot and the in-app banner.
 */
export function useIncomingMessages(from: Message['sender'], onMessage: (m: Message) => void, key: string | undefined) {
  useEffect(() => {
    if (!key) return;
    const channel = supabase
      .channel(`incoming:${from}:${key}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender=eq.${from}` },
        (payload) => onMessage(payload.new as Message))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // onMessage is intentionally not a dependency — callers pass inline closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, key]);
}
