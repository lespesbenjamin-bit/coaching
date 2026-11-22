import Sidebar, { type NavItem } from './Sidebar';

export const ADMIN_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/admin', label: 'Tableau de bord' },
  { key: 'agenda', href: '/admin/agenda', label: 'Agenda' },
  { key: 'collectifs', href: '/admin/collectifs', label: 'Gestion des collectifs' },
  { key: 'joueurs', href: '/admin/joueurs', label: 'Joueurs' },
  { key: 'tournois', href: '/admin/tournois', label: 'Tournois' },
  { key: 'packs', href: '/admin/packs', label: 'Packs et crédits' },
  { key: 'parametres', href: '/admin/parametres', label: 'Paramètres' },
];
export default function AdminNav({ current }: { current: 'dashboard' | 'agenda' | 'collectifs' | 'groupes' | 'joueurs' | 'tournois' | 'packs' | 'parametres' }) {
  return <Sidebar title="Espace coach" items={ADMIN_ITEMS} current={current} footer={<a href="/mon-espace">Espace joueur</a>} />;
}
