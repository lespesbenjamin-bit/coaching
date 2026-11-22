import AdminNav from '@/components/AdminNav';
import '@/app/admin/collectifs/pgm.css';

const TABS: [string, string, string][] = [
  ['dashboard', '/admin/collectifs', 'Tableau de bord'], ['groupes', '/admin/collectifs/groupes', 'Mes groupes'], ['planning', '/admin/collectifs/planning', 'Planning'],
  ['cycles', '/admin/collectifs/cycles', 'Suivi des cycles'], ['joueurs', '/admin/collectifs/joueurs', 'Joueurs'],
];
/** Habillage propre au module : styles isolés sous .pgm (variables CSS dédiées), indépendants des styles globaux du site. */
export default function Shell({ current, title, action, children }: { current: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="collectifs" />
      <div className="pgm">
        <header className="pgm-head"><div><div className="pgm-eyebrow">Gestion des collectifs</div><h1>{title}</h1></div>{action}</header>
        <nav className="pgm-tabs" aria-label="Gestion des collectifs">{TABS.map(([k, h, l]) => <a key={k} href={h} className={current === k ? 'on' : ''}>{l}</a>)}</nav>
        {children}
      </div>
    </div></main>
  );
}
export function Notice({ ok, err }: { ok?: string; err?: string }) {
  if (err) return <div className="pgm-note bad" role="alert">{err}</div>;
  if (ok) return <div className="pgm-note ok" role="status">{ok}</div>;
  return null;
}
