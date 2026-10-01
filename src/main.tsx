import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initTheme } from '@/lib/theme';
import { initLang, t } from '@/lib/i18n';
import { initMonitoring, ErrorBoundary } from '@/lib/monitoring';

initMonitoring();
initTheme();
initLang();

// Last-resort screen instead of a blank app if a render crashes (the error is reported).
function CrashScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
      <p className="text-lg font-semibold text-white mb-2">{t('Da ist etwas schiefgelaufen.')}</p>
      <p className="text-sm text-white/50 mb-6">{t('Der Fehler wurde gemeldet. Bitte lade die App neu.')}</p>
      <button onClick={() => window.location.reload()} className="adlr-tap px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>
        {t('Neu laden')}
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={<CrashScreen />}>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
