import { type ButtonHTMLAttributes, type ReactNode, type CSSProperties } from 'react';

const baseBtn = 'adlr-tap font-semibold rounded-xl px-5 py-3.5 text-sm tracking-wide transition-all disabled:cursor-not-allowed';

const variantStyles: Record<string, CSSProperties> = {
  primary: { background: 'rgb(var(--adlr-gold))', color: '#000000', border: 'none' },
  ghost: { background: 'rgb(var(--text) / 0.06)', color: 'rgb(var(--text))', border: '1px solid rgb(var(--text) / 0.12)' },
  danger: { background: 'rgba(139,0,0,0.2)', color: '#fca5a5', border: '1px solid rgba(139,0,0,0.5)' },
  'gold-outline': { background: 'transparent', color: 'rgb(var(--adlr-gold))', border: '1px solid rgb(var(--adlr-gold) / 0.5)' },
};

export function Button({
  children,
  variant = 'primary',
  className = '',
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'gold-outline';
}) {
  return (
    <button
      className={`${baseBtn} ${className}`}
      style={{ ...variantStyles[variant], ...style }}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/50 mb-2 tracking-wide uppercase">{label}</span>
      {children}
      {hint && <span className="block text-xs text-white/30 mt-1.5">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`adlr-input w-full bg-inset border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-white/25 transition-all ${props.className ?? ''}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`adlr-input w-full bg-inset border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-white/25 transition-all resize-none ${props.className ?? ''}`}
    />
  );
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`adlr-tap px-4 py-2.5 rounded-xl text-sm font-medium border transition-all`}
      style={
        active
          ? { background: 'rgb(var(--adlr-gold))', color: '#000000', borderColor: 'rgb(var(--adlr-gold))', fontWeight: 600 }
          : { background: 'rgb(var(--text) / 0.06)', color: 'rgb(var(--text) / 0.8)', border: '1px solid rgb(var(--text) / 0.15)' }
      }
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`adlr-card p-5 ${onClick ? 'adlr-tap cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
      {subtitle && <p className="text-sm text-white/40 mt-1">{subtitle}</p>}
    </div>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center mb-4">
        <span className="text-2xl" style={{ color: 'rgb(var(--adlr-gold))' }}>+</span>
      </div>
      <p className="text-white/60 font-medium">{title}</p>
      {subtitle && <p className="text-white/30 text-sm mt-1.5 max-w-xs">{subtitle}</p>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2px solid rgb(var(--adlr-gold) / 0.3)', borderTopColor: 'rgb(var(--adlr-gold))' }} />
    </div>
  );
}

export function StatCard({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="adlr-card p-4">
      <div className="text-2xl font-bold" style={accent ? { color: 'rgb(var(--adlr-gold))' } : { color: 'rgb(var(--text))' }}>{value}</div>
      <div className="text-xs text-white/40 mt-1 uppercase tracking-wide">{label}</div>
    </div>
  );
}
