'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
/** Rafraîchit la page tant que le paiement n'est pas confirmé par le webhook (max ~2 min). */
export default function Poll() {
  const r = useRouter();
  useEffect(() => { let n = 0; const t = setInterval(() => { if (++n > 30) clearInterval(t); else r.refresh(); }, 4000); return () => clearInterval(t); }, [r]);
  return null;
}
