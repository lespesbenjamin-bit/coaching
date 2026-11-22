'use client';
export default function ConfirmButton({ children, message, className = 'btn danger' }: { children: React.ReactNode; message: string; className?: string }) {
  return <button className={className} style={{ padding: '6px 10px', fontSize: 11 }} onClick={e => { if (!confirm(message)) e.preventDefault(); }}>{children}</button>;
}
