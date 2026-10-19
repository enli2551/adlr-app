import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { ensurePush, listenForPushTaps } from '@/lib/push';

/**
 * Remote push glue (renders nothing): registers the device once the user is logged in and
 * inside the app — never on the login screen or during onboarding — and opens the screen a
 * tapped notification points to (waiting for the login to finish on a cold start).
 */
export default function PushBridge() {
  const { session, profile, loading } = useAuth();
  const nav = useNavigate();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let off = () => {};
    listenForPushTaps(setPending).then((f) => { off = f; });
    return () => off();
  }, []);

  const ready = !loading && !!session && !!profile && (profile.role === 'trainer' || !!profile.intake_completed);

  useEffect(() => {
    if (!ready || !pending) return;
    nav(pending);
    setPending(null);
  }, [ready, pending, nav]);

  // A short delay so the permission prompt doesn't land on top of the first paint.
  useEffect(() => {
    if (!ready || !profile) return;
    const id = window.setTimeout(() => { ensurePush(profile.id).catch(() => {}); }, 2500);
    return () => window.clearTimeout(id);
  }, [ready, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
