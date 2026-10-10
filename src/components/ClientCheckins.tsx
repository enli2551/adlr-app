import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCheck, Send, Mic, Square, Video, Trash2, X, Loader2, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCoachName } from '@/lib/auth';
import { t, fmtDate, fmtNum } from '@/lib/i18n';
import type { WeeklyCheckin } from '@/lib/engagement';
import { computeCheckinStats, type CheckinStats } from '@/lib/checkinStats';
import CheckinStatsView from '@/components/CheckinStatsView';
import FeedbackMedia from '@/components/FeedbackMedia';
import SignedPhoto from '@/components/SignedPhoto';

const SCALES: { key: 'energy' | 'sleep' | 'stress' | 'nutrition'; label: string; invert?: boolean }[] = [
  { key: 'energy', label: 'Energie' },
  { key: 'sleep', label: 'Schlaf' },
  { key: 'stress', label: 'Stress', invert: true },
  { key: 'nutrition', label: 'Ernährung' },
];

type Pose = 'front' | 'side' | 'back';
const POSES: { key: Pose; col: 'photo_front' | 'photo_side' | 'photo_back'; label: string }[] = [
  { key: 'front', col: 'photo_front', label: 'Vorne' },
  { key: 'side', col: 'photo_side', label: 'Seite' },
  { key: 'back', col: 'photo_back', label: 'Hinten' },
];
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

function tone(v: number | null, invert?: boolean): string {
  if (v == null) return 'text-white/30';
  const good = invert ? v <= 2 : v >= 4;
  const bad = invert ? v >= 4 : v <= 2;
  return good ? 'text-emerald-400' : bad ? 'text-red-400' : 'text-white/70';
}

type Media = { blob: Blob; type: 'audio' | 'video'; url: string; ext: string };

/** Voice message via MediaRecorder (mp4/aac where supported — plays on iPhone too). */
function useVoiceRecorder() {
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);
  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.current = r;
      r.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      setError(t('Kein Zugriff aufs Mikrofon. Erlaube es in den Einstellungen.'));
    }
  };
  const stop = () => new Promise<Media | null>((resolve) => {
    const r = rec.current;
    if (!r) { resolve(null); return; }
    r.onstop = () => {
      r.stream.getTracks().forEach((tr) => tr.stop());
      setRecording(false);
      const type = r.mimeType || 'audio/webm';
      const blob = new Blob(chunks.current, { type });
      resolve(blob.size > 0 ? { blob, type: 'audio', url: URL.createObjectURL(blob), ext: type.includes('mp4') ? 'm4a' : 'webm' } : null);
    };
    r.stop();
  });
  return { start, stop, recording, seconds, error };
}

function Composer({ checkin, clientId, onDone }: { checkin: WeeklyCheckin; clientId: string; onDone: () => void }) {
  const coach = useCoachName();
  const [text, setText] = useState(checkin.trainer_reply ?? '');
  const [media, setMedia] = useState<Media | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const voice = useVoiceRecorder();

  const pickVideo = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_MEDIA_BYTES) { setErr(t('Das Video ist zu groß (max. 50 MB). Nimm ein kürzeres auf.')); return; }
    setErr(null);
    setMedia({ blob: f, type: 'video', url: URL.createObjectURL(f), ext: (f.name.split('.').pop() || 'mp4').toLowerCase() });
  };

  const send = async () => {
    const body = text.trim();
    if (!body && !media) return;
    setBusy(true); setErr(null);
    let mediaPath: string | null = checkin.reply_media_path ?? null;
    let mediaType: 'audio' | 'video' | null = checkin.reply_media_type ?? null;
    if (media) {
      const path = `${clientId}/${checkin.id}-${Date.now()}.${media.ext}`;
      const { error } = await supabase.storage.from('feedback').upload(path, media.blob, { contentType: media.blob.type || undefined });
      if (error) { setBusy(false); setErr(t('Aufnahme konnte nicht hochgeladen werden ({msg}).', { msg: error.message })); return; }
      mediaPath = path; mediaType = media.type;
    }
    const now = new Date().toISOString();
    let { error } = await supabase.from('weekly_checkins').update({ trainer_reply: body || null, replied_at: now, reply_media_path: mediaPath, reply_media_type: mediaType }).eq('id', checkin.id);
    if (error && !media) ({ error } = await supabase.from('weekly_checkins').update({ trainer_reply: body || null, replied_at: now }).eq('id', checkin.id));
    if (error) { setBusy(false); setErr(t('Konnte nicht gespeichert werden.')); return; }
    // The client also gets a note in the chat; the reply itself shows on their Training screen.
    const note = media?.type === 'audio' ? t('🎙️ {coach} hat dir eine Sprachnachricht zu deinem Check-in geschickt.', { coach })
      : media?.type === 'video' ? t('🎬 {coach} hat dir ein Video zu deinem Check-in geschickt.', { coach }) : null;
    await supabase.from('messages').insert({ client_id: clientId, sender: 'trainer', body: [note, body ? `${t('Zu deinem Check-in')}: ${body}` : null].filter(Boolean).join('\n') });
    setBusy(false);
    onDone();
  };

  return (
    <div className="mt-2 space-y-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={t('Kurz antworten…')}
        className="w-full bg-inset border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none resize-none" />
      {media && (
        <div className="rounded-xl p-2 flex items-center gap-2" style={{ background: 'rgb(var(--text) / 0.04)' }}>
          {media.type === 'audio' ? <audio src={media.url} controls className="flex-1 min-w-0" /> : <video src={media.url} controls playsInline className="flex-1 min-w-0 max-h-48 rounded-lg bg-black" />}
          <button onClick={() => setMedia(null)} aria-label={t('Verwerfen')} className="adlr-tap p-2 text-white/40"><Trash2 size={15} /></button>
        </div>
      )}
      <div className="flex items-center gap-2">
        {voice.recording ? (
          <button onClick={async () => { const m = await voice.stop(); if (m) setMedia(m); }} className="adlr-tap flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-500/15 text-red-400">
            <Square size={13} /> {t('Stopp')} · {Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, '0')}
          </button>
        ) : (
          <button onClick={voice.start} disabled={busy} className="adlr-tap flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 text-white/70">
            <Mic size={14} /> {t('Sprachnachricht')}
          </button>
        )}
        <label className="adlr-tap flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 text-white/70 cursor-pointer">
          <Video size={14} /> {t('Video')}
          <input type="file" accept="video/*" capture="user" className="hidden" onChange={(e) => pickVideo(e.target.files?.[0])} />
        </label>
        <button onClick={send} disabled={busy || voice.recording || (!text.trim() && !media)} aria-label={t('Senden')}
          className="adlr-tap ml-auto px-3 py-2 rounded-xl disabled:opacity-40 flex items-center gap-1.5 text-xs font-semibold" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {t('Senden')}
        </button>
      </div>
      {(err || voice.error) && <p className="text-xs text-red-400">{err ?? voice.error}</p>}
    </div>
  );
}

/** Trainer ClientDetail: the client's weekly check-ins, newest first — automatic week data,
 *  photos (compare with earlier weeks), and a reply as text, voice message or video. */
export default function ClientCheckins({ clientId, kcalTarget = null }: { clientId: string; kcalTarget?: number | null }) {
  const [rows, setRows] = useState<WeeklyCheckin[] | null>(null);
  const [computed, setComputed] = useState<Record<string, CheckinStats>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ pose: Pose; idx: number } | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from('weekly_checkins').select('*').eq('client_id', clientId).order('week_start', { ascending: false }).limit(12);
    setRows(error ? null : ((data ?? []) as WeeklyCheckin[]));
  };
  useEffect(() => { load(); }, [clientId]);
  // Older check-ins (before the automatic summary existed): compute it now.
  useEffect(() => {
    if (!rows) return;
    rows.slice(0, 4).filter((r) => !r.stats && !computed[r.id]).forEach((r) => {
      computeCheckinStats(clientId, r.week_start, kcalTarget).then((s) => setComputed((c) => ({ ...c, [r.id]: s }))).catch(() => {});
    });
  }, [rows]);

  if (!rows || rows.length === 0) return null;
  const withPhoto = (pose: Pose) => rows.filter((r) => r[POSES.find((p) => p.key === pose)!.col]);

  return (
    <div className="adlr-card p-5 mb-4">
      <p className="text-sm font-medium text-white/80 flex items-center gap-2 mb-3"><ClipboardCheck size={16} className="text-adlr-gold" /> {t('Wöchentliche Check-ins')}</p>
      <div className="space-y-5">
        {rows.map((c, i) => {
          const stats = c.stats ?? computed[c.id];
          const photos = POSES.filter((p) => c[p.col]);
          return (
            <div key={c.id} className={i > 0 ? 'pt-5 border-t border-white/5' : ''}>
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-semibold text-white">{t('Woche ab {date}', { date: fmtDate(c.week_start, { day: 'numeric', month: 'short' }) })}</p>
                {c.weight_kg != null && <span className="text-xs text-white/60">{fmtNum(Number(c.weight_kg))} kg</span>}
              </div>
              {stats && <div className="mb-2"><CheckinStatsView stats={stats} /></div>}
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {SCALES.map((s) => (
                  <div key={s.key} className="rounded-lg py-1.5 text-center" style={{ background: 'rgb(var(--text) / 0.04)' }}>
                    <p className={`text-base font-bold ${tone(c[s.key], s.invert)}`}>{c[s.key] ?? '–'}</p>
                    <p className="text-[10px] text-white/40">{t(s.label)}</p>
                  </div>
                ))}
              </div>
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {photos.map((p) => (
                    <button key={p.key} onClick={() => setViewer({ pose: p.key, idx: withPhoto(p.key).findIndex((r) => r.id === c.id) })} className="adlr-tap relative aspect-[3/4] rounded-lg overflow-hidden" style={{ background: 'rgb(var(--text) / 0.04)' }}>
                      <SignedPhoto path={c[p.col]!} alt={t(p.label)} />
                      <span className="absolute bottom-1 left-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white">{t(p.label)}</span>
                    </button>
                  ))}
                </div>
              )}
              {c.wins && <p className="text-xs text-white/70 mb-1"><span className="text-emerald-400">＋</span> {c.wins}</p>}
              {c.struggles && <p className="text-xs text-white/70 mb-1"><span className="text-red-400">－</span> {c.struggles}</p>}
              {(c.trainer_reply || c.reply_media_path) && editing !== c.id ? (
                <div className="mt-2 rounded-xl p-2.5" style={{ background: 'rgb(var(--adlr-gold) / 0.07)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] uppercase tracking-wider text-adlr-gold/80">{t('Deine Antwort')}</p>
                    <button onClick={() => setEditing(c.id)} className="adlr-tap p-1 text-white/40" aria-label={t('Bearbeiten')}><Pencil size={13} /></button>
                  </div>
                  {c.reply_media_path && c.reply_media_type && <div className="mb-1"><FeedbackMedia path={c.reply_media_path} type={c.reply_media_type} /></div>}
                  {c.trainer_reply && <p className="text-xs text-white/75 whitespace-pre-line">{c.trainer_reply}</p>}
                </div>
              ) : (
                <Composer checkin={c} clientId={clientId} onDone={() => { setEditing(null); load(); }} />
              )}
            </div>
          );
        })}
      </div>
      {viewer && <PhotoCompare rows={withPhoto(viewer.pose)} pose={viewer.pose} startIdx={viewer.idx} onClose={() => setViewer(null)} />}
    </div>
  );
}

/** Fullscreen: this week's photo next to an earlier one of the same pose. */
function PhotoCompare({ rows, pose, startIdx, onClose }: { rows: WeeklyCheckin[]; pose: Pose; startIdx: number; onClose: () => void }) {
  const col = POSES.find((p) => p.key === pose)!.col;
  const [idx] = useState(Math.max(0, startIdx));
  const [cmp, setCmp] = useState(Math.min(rows.length - 1, Math.max(0, startIdx) + 1));
  const cur = rows[idx];
  const other = rows[cmp];
  const label = (r: WeeklyCheckin) => fmtDate(r.week_start, { day: 'numeric', month: 'short' });
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/95 flex flex-col adlr-fade-in" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-semibold text-white">{t(POSES.find((p) => p.key === pose)!.label)}</p>
        <button onClick={onClose} aria-label={t('Schließen')} className="adlr-tap p-2 text-white/60"><X size={20} /></button>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-1 px-1">
        {[other !== cur ? other : null, cur].map((r, i) => (
          <div key={i} className="relative min-h-0 rounded-lg overflow-hidden bg-white/5">
            {r ? <SignedPhoto path={r[col]!} /> : <div className="w-full h-full flex items-center justify-center text-xs text-white/30 p-4 text-center">{t('Noch kein früheres Foto')}</div>}
            {r && <span className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded bg-black/60 text-white">{label(r)}</span>}
          </div>
        ))}
      </div>
      {rows.length > 2 && (
        <div className="px-4 py-3 flex gap-1.5 overflow-x-auto">
          <span className="text-xs text-white/45 self-center shrink-0 mr-1">{t('Vergleich mit')}</span>
          {rows.map((r, i) => i === idx ? null : (
            <button key={r.id} onClick={() => setCmp(i)} className="adlr-tap shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={i === cmp ? { background: 'rgb(var(--adlr-gold))', color: '#000' } : { background: 'rgb(255 255 255 / 0.08)', color: 'rgb(255 255 255 / 0.7)' }}>{label(r)}</button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
