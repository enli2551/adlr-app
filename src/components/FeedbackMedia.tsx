import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';

/** Coach's voice/video reply to a check-in (private 'feedback' bucket → short-lived signed URL). */
export default function FeedbackMedia({ path, type }: { path: string; type: 'audio' | 'video' }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    supabase.storage.from('feedback').createSignedUrl(path, 3600).then(({ data, error }) => {
      if (!active) return;
      if (error || !data?.signedUrl) setFailed(true);
      else setUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [path]);

  if (failed) return <p className="text-xs text-white/40">{t('Aufnahme konnte nicht geladen werden.')}</p>;
  if (!url) return <Loader2 size={16} className="animate-spin text-white/30" />;
  return type === 'video'
    ? <video src={url} controls playsInline preload="metadata" className="w-full rounded-xl bg-black max-h-[60vh]" />
    : <audio src={url} controls preload="metadata" className="w-full" />;
}
