interface LogoProps {
  size?: number;
  showTagline?: boolean;
  className?: string;
}

// Stylized "ADLR" wordmark with a subtle eagle-wing sweep integrated into the A.
export default function Logo({ size = 36, showTagline = false, className = '' }: LogoProps) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg
        width={size * 4}
        height={size}
        viewBox="0 0 200 50"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Eagle wing sweep forming the left stroke of the A */}
        <path
          d="M6 46 L20 6 Q26 2 30 6 L44 46"
          stroke="rgb(var(--adlr-gold))"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14 30 Q27 24 36 30"
          stroke="rgb(var(--adlr-gold))"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.7"
        />
        {/* D */}
        <path
          d="M52 6 L52 44 Q72 44 72 25 Q72 6 52 6"
          stroke="rgb(var(--text))"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* L */}
        <path
          d="M82 6 L82 44 L108 44"
          stroke="rgb(var(--text))"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* R */}
        <path
          d="M118 6 L118 44 M118 6 L140 6 Q150 6 150 16 Q150 26 140 26 L118 26 M134 26 L150 44"
          stroke="rgb(var(--text))"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showTagline && (
        <span className="mt-1 text-[10px] tracking-[0.3em] text-white/40 uppercase font-medium">
          Steig auf. Bleib stark.
        </span>
      )}
    </div>
  );
}
