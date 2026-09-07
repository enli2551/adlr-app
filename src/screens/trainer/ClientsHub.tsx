import { useSearchParams } from 'react-router-dom';
import { Users, Calendar } from 'lucide-react';
import ClientsScreen from './ClientsScreen';
import CalendarScreen from './CalendarScreen';

type View = 'klienten' | 'kalender';

/**
 * Combined Klienten + Kalender tab. Both are client-centric, so they share one
 * bottom-nav slot with a segmented toggle. The active view lives in the URL
 * (?view=kalender) so deep links work and the "Klienten" nav item stays highlighted
 * for both sub-views.
 */
export default function ClientsHub() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'kalender' ? 'kalender' : 'klienten';

  const setView = (v: View) => {
    setParams(v === 'kalender' ? { view: 'kalender' } : {}, { replace: true });
  };

  const tabs: { id: View; label: string; icon: typeof Users }[] = [
    { id: 'klienten', label: 'Klienten', icon: Users },
    { id: 'kalender', label: 'Kalender', icon: Calendar },
  ];

  return (
    <div>
      <div className="flex gap-1.5 p-1 rounded-xl mb-4" style={{ background: 'rgb(var(--text) / 0.04)', border: '1px solid rgb(var(--text) / 0.06)' }}>
        {tabs.map((t) => {
          const active = view === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className="adlr-tap flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all"
              style={active
                ? { background: 'rgb(var(--adlr-gold))', color: '#000' }
                : { background: 'transparent', color: 'rgb(var(--text) / 0.5)' }}
            >
              <t.icon size={15} strokeWidth={active ? 2.2 : 1.8} />
              {t.label}
            </button>
          );
        })}
      </div>
      {view === 'klienten' ? <ClientsScreen /> : <CalendarScreen />}
    </div>
  );
}
