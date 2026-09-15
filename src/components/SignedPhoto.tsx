import { useState, useEffect } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Progress photos live in a PRIVATE storage bucket ('photos'), so getPublicUrl
// does not work — we mint a short-lived signed URL (RLS-checked) to display them.
export default function SignedPhoto({ path, bucket = 'photos', alt = '' }: { path: string; bucket?: string; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data?.signedUrl) { setFailed(true); return; }
        setUrl(data.signedUrl);
      });
    return () => { active = false; };
  }, [path, bucket]);

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/25">
        <ImageOff size={18} />
      </div>
    );
  }
  if (!url) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/20">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }
  return <img src={url} alt={alt} className="w-full h-full object-cover" onError={() => setFailed(true)} />;
}
