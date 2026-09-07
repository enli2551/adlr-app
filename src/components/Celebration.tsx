import { useMemo } from 'react';

const COLORS = ['rgb(var(--adlr-gold))', '#E8D58A', '#FFFFFF', 'rgb(var(--adlr-gold-dim))'];

// Lightweight pure-CSS confetti burst. Mount it briefly (parent controls lifetime).
export default function Celebration({ count = 56 }: { count?: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: 30 + Math.random() * 40, // vw %
        dx: (Math.random() * 2 - 1) * 200,
        dy: 220 + Math.random() * 420,
        rot: (Math.random() * 2 - 1) * 720,
        delay: Math.random() * 0.18,
        duration: 1.0 + Math.random() * 0.7,
        w: 5 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      })),
    [count]
  );

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none overflow-hidden">
      {particles.map((p, i) => {
        const style = {
          position: 'absolute',
          top: '28%',
          left: `${p.left}%`,
          width: `${p.w}px`,
          height: `${p.h}px`,
          background: p.color,
          borderRadius: '2px',
          '--dx': `${p.dx}px`,
          '--dy': `${p.dy}px`,
          '--rot': `${p.rot}deg`,
          animation: `adlr-confetti ${p.duration}s cubic-bezier(0.2,0.6,0.4,1) ${p.delay}s forwards`,
        } as React.CSSProperties;
        return <span key={i} style={style} />;
      })}
    </div>
  );
}
