/** Visuel du bon cadeau (aperçu). Purement présentatif : aucun code utilisable n'est jamais affiché ici. */
export type CardProps = { variant?: 'hero' | 'preview'; subtitle?: string; recipient?: string; message?: string; validity?: string };

function Ball({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <defs><radialGradient id="bcBall" cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#f2ff9c" /><stop offset="0.55" stopColor="#d9ff3f" /><stop offset="1" stopColor="#9bbd12" /></radialGradient></defs>
      <circle cx="50" cy="50" r="46" fill="url(#bcBall)" />
      <path d="M8 38c22 8 36 26 40 58M92 62C70 54 56 36 52 4" fill="none" stroke="#f6ffd0" strokeOpacity=".75" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
function Racket({ className }: { className?: string }) {
  const holes = [] as { x: number; y: number }[];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) { const x = 70 + c * 14 - (r % 2) * 7, y = 50 + r * 14; if (Math.hypot(x - 100, y - 92) < 52) holes.push({ x, y }); }
  return (
    <svg className={className} viewBox="0 0 200 320" aria-hidden="true">
      <defs><linearGradient id="bcRk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2a302c" /><stop offset="1" stopColor="#111412" /></linearGradient></defs>
      <path d="M100 18c48 0 82 34 82 80 0 40-24 70-52 90l-6 70h-48l-6-70c-28-20-52-50-52-90 0-46 34-80 82-80Z" fill="url(#bcRk)" stroke="#d9ff3f" strokeOpacity=".7" strokeWidth="3" />
      {holes.map((h, i) => <circle key={i} cx={h.x} cy={h.y} r="3.4" fill="#0b0d0c" />)}
      <rect x="86" y="258" width="28" height="56" rx="8" fill="#0b0d0c" stroke="#d9ff3f" strokeOpacity=".5" strokeWidth="2" />
    </svg>
  );
}
function Ribbon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 140" aria-hidden="true">
      <path d="M80 70C56 20 8 8 4 36c-3 24 40 36 76 34Z" fill="#d9ff3f" />
      <path d="M80 70C104 20 152 8 156 36c3 24-40 36-76 34Z" fill="#c4eb26" />
      <path d="M80 70C60 96 30 130 18 132c-6-30 24-52 62-62Z" fill="#b8db1f" />
      <path d="M80 70c20 26 50 60 62 62 6-30-24-52-62-62Z" fill="#a4c817" />
      <path d="M80 70C56 20 8 8 4 36" fill="none" stroke="#f6ffd0" strokeOpacity=".5" strokeWidth="2" />
      <rect x="66" y="56" width="28" height="30" rx="9" fill="#d9ff3f" stroke="#a4c817" strokeWidth="2" />
    </svg>
  );
}

export default function VoucherCard({ variant = 'preview', subtitle = 'Cours de padel', recipient, message, validity }: CardProps) {
  return (
    <div className={`bc-card bc-card--${variant}`} role="img" aria-label={`Bon cadeau — ${subtitle}${recipient ? `, pour ${recipient}` : ''}`}>
      <div className="bc-card-court" aria-hidden="true" />
      <div className="bc-card-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={36} height={36} />
        <span><b>BENJAMIN LESPES</b><small>COACH PADEL TOULOUSE</small></span>
      </div>
      <div className="bc-card-main">
        <div className="bc-card-title">Bon cadeau</div>
        <div className="bc-card-sub">{subtitle}</div>
        {recipient && <div className="bc-card-for">Pour {recipient}</div>}
        {message && <div className="bc-card-msg">« {message.length > 90 ? message.slice(0, 88) + '…' : message} »</div>}
        {validity && <div className="bc-card-valid">{validity}</div>}
      </div>
      <Racket className="bc-card-racket" /><Ball className="bc-card-ball" />
      {variant === 'hero' && <Ribbon className="bc-card-ribbon" />}
    </div>
  );
}
