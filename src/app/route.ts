import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Accueil "/" : le site vitrine (public/index.html) est lu au build et servi tel quel, URL inchangée.
export const dynamic = 'force-static';

export function GET() {
  const html = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf8');
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
