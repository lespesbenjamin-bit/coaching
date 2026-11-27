'use client';
import { useState } from 'react';

/** Aperçu de la section dans un cadre isolé : largeur ordinateur ou mobile, sans script ni suivi. */
export default function Preview({ html }: { html: string }) {
  const [mobile, setMobile] = useState(false);
  const doc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/evs.css"><style>body{margin:0;background:#0b0d0c}</style></head><body>${html}</body></html>`;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="row-actions" style={{ marginBottom: 8 }}>
        <button type="button" className={mobile ? 'btn ghost' : 'btn'} onClick={() => setMobile(false)}>Aperçu ordinateur</button>
        <button type="button" className={mobile ? 'btn' : 'btn ghost'} onClick={() => setMobile(true)}>Aperçu mobile</button>
      </div>
      <div style={{ background: '#e7e7e2', padding: 10, borderRadius: 12, display: 'flex', justifyContent: 'center' }}>
        <iframe title="Aperçu du podium" sandbox="" srcDoc={doc} style={{ width: mobile ? 390 : '100%', maxWidth: '100%', height: mobile ? 760 : 560, border: 0, background: '#0b0d0c', borderRadius: 8 }} />
      </div>
    </div>
  );
}
