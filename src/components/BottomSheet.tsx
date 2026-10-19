import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t } from '@/lib/i18n';

/** Details on demand: a sheet over the page (above the bottom navigation). */
export default function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center adlr-fade-in" onClick={onClose}>
      <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-adlr-black" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <p className="text-lg font-bold text-white">{title}</p>
          <button onClick={onClose} aria-label={t('Schließen')} className="adlr-tap p-1.5 text-white/40"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
