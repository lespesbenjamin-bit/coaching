const ITEMS: [string, string, string][] = [
  ['dashboard', '/admin', 'Tableau de bord'], ['agenda', '/admin/agenda', 'Agenda'], ['groupes', '/admin/groupes', 'Groupes'],
  ['joueurs', '/admin/joueurs', 'Joueurs'], ['packs', '/admin/packs', 'Packs et crédits'], ['bons', '/admin/bons-cadeaux', 'Bons cadeaux'], ['campagnes', '/admin/campagnes', 'Campagnes commerciales'], ['parametres', '/admin/parametres', 'Paramètres'],
];
export default function AdminNav({ current }: { current: 'dashboard' | 'agenda' | 'groupes' | 'joueurs' | 'packs' | 'bons' | 'campagnes' | 'parametres' }) {
  return (
    <nav className="tabs" aria-label="Administration" style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
      {ITEMS.map(([k, href, label]) => <a key={k} href={href} className={current === k ? 'on' : ''}>{label}</a>)}
    </nav>
  );
}
