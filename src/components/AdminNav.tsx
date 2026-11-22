import Sidebar, { type NavItem } from './Sidebar';

export const ADMIN_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/admin', label: 'Tableau de bord' },
  { key: 'agenda', href: '/admin/agenda', label: 'Agenda' },
  { key: 'groupes', href: '/admin/groupes', label: 'Groupes' },
  { key: 'joueurs', href: '/admin/joueurs', label: 'Joueurs' },
  { key: 'tournois', href: '/admin/tournois', label: 'Tournois' },
  { key: 'packs', href: '/admin/packs', label: 'Packs et crédits' },
  { key: 'parametres', href: '/admin/parametres', label: 'Paramètres' },
];
export default function AdminNav({ current }: { current: 'dashboard' | 'agenda' | 'groupes' | 'joueurs' | 'tournois' | 'packs' | 'parametres' }) {
  return <Sidebar title="Espace coach" items={ADMIN_ITEMS} current={current} footer={<a href="/mon-espace">Espace joueur</a>} />;
}
