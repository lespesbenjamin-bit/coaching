export type NavItem = { key: string; href: string; label: string };
/** Navigation latérale (bureau) / barre défilante (mobile). */
export default function Sidebar({ title, items, current, footer }: { title: string; items: NavItem[]; current: string; footer?: React.ReactNode }) {
  return (
    <nav className="side" aria-label={title}>
      <div className="side-title">{title}</div>
      <ul>{items.map(i => <li key={i.key}><a href={i.href} className={current === i.key ? 'on' : ''} aria-current={current === i.key ? 'page' : undefined}>{i.label}</a></li>)}</ul>
      {footer && <div className="side-foot">{footer}</div>}
    </nav>
  );
}
