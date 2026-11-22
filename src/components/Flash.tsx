export default function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (err) return <div className="notice bad" role="alert">{err}</div>;
  if (ok) return <div className="notice ok" role="status">{ok === '1' ? 'Enregistré.' : ok}</div>;
  return null;
}
