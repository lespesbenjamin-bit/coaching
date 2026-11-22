import './player.css';

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  book: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4v2a3 3 0 0 0 4 3M16 6h4v2a3 3 0 0 1-4 3M12 13v4M8 20h8',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  user: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a8 8 0 0 1 16 0',
};
export const PLAYER_NAV: { key: string; href: string; label: string; short?: string; icon: keyof typeof ICONS }[] = [
  { key: 'accueil', href: '/mon-espace', label: 'Mon espace', short: 'Accueil', icon: 'home' },
  { key: 'reserver', href: '/reservation', label: 'Réserver un cours', short: 'Réserver', icon: 'book' },
  { key: 'cours', href: '/mon-espace?tab=cours', label: 'Mes cours', short: 'Cours', icon: 'list' },
  { key: 'tournois', href: '/mon-espace?tab=tournois', label: 'Tournois', icon: 'trophy' },
  { key: 'progression', href: '/mon-espace?tab=progression', label: 'Ma progression', short: 'Progrès', icon: 'chart' },
  { key: 'profil', href: '/mon-espace?tab=profil', label: 'Mon profil', short: 'Profil', icon: 'user' },
];
export const initials = (first?: string | null, last?: string | null) => `${(first ?? '').charAt(0)}${(last ?? '').charAt(0)}`.toUpperCase() || '·';

export function Avatar({ url, first, last, small }: { url?: string | null; first?: string | null; last?: string | null; small?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className={`pj-avatar${small ? ' sm' : ''}`} src={url} alt="" /> : <span className={`pj-avatar${small ? ' sm' : ''}`} aria-hidden="true">{initials(first, last)}</span>;
}

/** Habillage de l'espace joueur : barre latérale (bureau) / barre du bas (mobile). Aucun lien vers un module non livré. */
export default function PlayerShell({ current, name, avatarUrl, first, last, isAdmin, signOut, children }: {
  current: string; name: string; avatarUrl?: string | null; first?: string | null; last?: string | null; isAdmin?: boolean; signOut: () => Promise<void>; children: React.ReactNode;
}) {
  return (
    <div className="pj">
      <nav className="pj-nav" aria-label="Espace joueur">
        <div className="pj-user"><Avatar url={avatarUrl} first={first} last={last} small /><span>{name}</span></div>
        <ul>{PLAYER_NAV.map(i => (
          <li key={i.key}><a href={i.href} className={current === i.key ? 'on' : ''} aria-current={current === i.key ? 'page' : undefined}>
            <svg className="pj-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[i.icon]} /></svg>
            <span className="lbl-long">{i.label}</span><span className="lbl-short">{i.short ?? i.label}</span></a></li>))}</ul>
        <div className="pj-user" style={{ marginTop: 'auto', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          {isAdmin && <a href="/admin/agenda" style={{ color: '#cbd5e1', fontSize: 13 }}>Espace coach</a>}
          <form action={signOut}><button style={{ background: 'none', border: 0, color: '#cbd5e1', font: 'inherit', fontSize: 13, cursor: 'pointer', padding: 0 }}>Déconnexion</button></form>
        </div>
      </nav>
      <main className="pj-main">{children}</main>
    </div>
  );
}
