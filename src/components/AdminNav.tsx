export default function AdminNav({ current }: { current: 'agenda' | 'joueurs' }) {
  return (
    <nav className="tabs" aria-label="Administration">
      <a href="/admin/agenda" className={current === 'agenda' ? 'on' : ''}>Agenda</a>
      <a href="/admin/joueurs" className={current === 'joueurs' ? 'on' : ''}>Joueurs</a>
    </nav>
  );
}
