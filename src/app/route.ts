import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { activeSpotlightHtml } from '@/lib/campaigns-server';

// Accueil "/" : le site vitrine (public/index.html), URL inchangée. Le podium « offres du moment » est inséré
// juste sous l'en-tête quand une campagne est active ; sinon la page est servie telle quelle.
// Réponse mise en cache par le CDN 60 s : un changement dans l'administration est visible en moins d'une minute.
export const dynamic = 'force-dynamic';
const MARK = '<section class="section section--tint" id="individuel">';

async function baseHtml(req: Request) {
  try { return readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf8'); }
  catch { return await (await fetch(new URL('/index.html', req.url))).text(); }
}
export async function GET(req: Request) {
  let html = await baseHtml(req);
  try {
    const spot = await activeSpotlightHtml();
    if (spot && html.includes(MARK) && html.includes('</head>')) {
      html = html.replace('</head>', '<link rel="stylesheet" href="/css/evs.css"></head>').replace(MARK, `${spot}\n${MARK}`);
    }
  } catch { /* le site reste servi sans podium */ }
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } });
}
