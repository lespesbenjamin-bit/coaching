import { describe, it, expect } from 'vitest';
import { campaignInput, campaignState, ctaHref, pickActive, pricing, spotlightHtml, type Campaign } from '@/lib/campaigns';

const base: Campaign = { id: '11111111-1111-4111-8111-111111111111', name: 'Noël', eyebrow: 'Édition Noël 2026', title: 'Cette année, offrez du padel.', highlight: 'padel', description: 'Desc', voucher_product: 'pack5', price_cents: null, reference_price_cents: 22500, show_reference: false, cta_label: 'Offrir ce bon cadeau', cta_url: '/bon-cadeau', reassurance: 'Bon cadeau personnalisé en PDF', media_path: null, status: 'published', starts_on: null, ends_on: null, priority: 0, created_at: '2026-11-01T00:00:00Z' };
const T = '2026-12-01';

describe('campagnes', () => {
  it('états selon statut et dates', () => {
    expect(campaignState({ ...base, status: 'draft' }, T)).toBe('draft');
    expect(campaignState({ ...base, starts_on: '2026-12-10' }, T)).toBe('scheduled');
    expect(campaignState({ ...base, ends_on: '2026-11-30' }, T)).toBe('expired');
    expect(campaignState({ ...base, ends_on: '2026-12-01' }, T)).toBe('live');
  });
  it('une seule campagne : priorité, puis début le plus récent', () => {
    const a = { ...base, id: 'a', priority: 1 }, b = { ...base, id: 'b', priority: 5 }, c = { ...base, id: 'c', priority: 5, starts_on: '2026-11-20' }, d = { ...base, id: 'd', priority: 99, status: 'draft' as const };
    expect(pickActive([a, b, c, d], T)?.id).toBe('c');
    expect(pickActive([d], T)).toBeNull();
    expect(pickActive([], T)).toBeNull();
  });
  it('prix : celui de la formule fait foi ; prix barré seulement si activé et supérieur', () => {
    expect(pricing({ ...base, price_cents: 9999 }, 20000).price).toBe(20000);
    expect(pricing(base, 20000).reference).toBeNull();
    expect(pricing({ ...base, show_reference: true }, 20000)).toEqual({ price: 20000, reference: 22500, saving: 2500 });
    expect(pricing({ ...base, show_reference: true, reference_price_cents: 15000 }, 20000).reference).toBeNull();
  });
  it('lien du bouton : présélection + attribution, jamais de prix', () => {
    expect(ctaHref(base)).toBe('/bon-cadeau?offre=pack5&c=11111111-1111-4111-8111-111111111111');
    expect(ctaHref({ ...base, voucher_product: null })).toBe('/bon-cadeau?c=11111111-1111-4111-8111-111111111111');
    expect(ctaHref({ ...base, cta_url: 'https://exemple.fr/x' })).toBe('https://exemple.fr/x');
    expect(ctaHref(base)).not.toMatch(/prix|price|amount/i);
  });
  it('HTML : mot en vert, échappement, aperçu sans script', () => {
    const h = spotlightHtml({ campaign: base, productPriceCents: 20000 });
    expect(h).toContain('Cette année,<br>offrez du <em>padel</em>.'); expect(h).toContain('200 €'); expect(h).not.toContain('<s>'); expect(h).toContain('<script>');
    const x = spotlightHtml({ campaign: { ...base, title: '<img src=x onerror=alert(1)>', highlight: null, description: '"><script>1</script>' } }, { preview: true });
    expect(x).not.toContain('<img src=x'); expect(x).not.toContain('<script>'); expect(x).toContain('href="#"');
    expect(spotlightHtml({ campaign: { ...base, show_reference: true }, productPriceCents: 20000 })).toContain('Vous économisez 25 €');
  });
  it('formules : liens de présélection, formule de la campagne mise en avant, masquées par défaut', () => {
    const f = [{ code: 'single', credits: 1, price_cents: 4500, promo: null }, { code: 'pack5', credits: 5, price_cents: 20000, promo: 'Offre de Noël' }];
    expect(spotlightHtml({ campaign: base, formulas: f })).not.toContain('evs-formulas');
    const h = spotlightHtml({ campaign: { ...base, show_formulas: true }, formulas: f });
    expect(h).toContain('/bon-cadeau?offre=single&amp;c=11111111-1111-4111-8111-111111111111'); expect(h).toContain('class="evs-f is-on"'); expect(h).toContain('45\u00a0€'); expect(h).toContain('Offre de Noël');
    expect(spotlightHtml({ campaign: { ...base, show_formulas: true }, formulas: f }, { preview: true })).not.toContain('/bon-cadeau?offre');
  });
  it('formulaire : validation', () => {
    const ok = { name: 'N', eyebrow: '', title: 'T', highlight: '', description: '', voucher_product: 'pack5', price: '', reference: '225', show_reference: 'on', cta_label: 'Go', cta_url: '/bon-cadeau', reassurance: '', bg_color: '', starts_on: '', ends_on: '2026-12-31', priority: '10' };
    const p = campaignInput.safeParse(ok); expect(p.success).toBe(true); if (p.success) { expect(p.data.reference).toBe(22500); expect(p.data.show_reference).toBe(true); expect(p.data.starts_on).toBeNull(); }
    expect(campaignInput.safeParse({ ...ok, cta_url: '//evil.example' }).success).toBe(false);
    expect(campaignInput.safeParse({ ...ok, cta_url: 'javascript:alert(1)' }).success).toBe(false);
    expect(campaignInput.safeParse({ ...ok, starts_on: '2026-12-31', ends_on: '2026-12-01' }).success).toBe(false);
    expect(campaignInput.safeParse({ ...ok, reference: '' }).success).toBe(false);
    expect(campaignInput.safeParse({ ...ok, priority: '500' }).success).toBe(false);
    expect(campaignInput.safeParse({ ...ok, bg_color: '#F0EDE6' }).success).toBe(true);
    expect(campaignInput.safeParse({ ...ok, bg_color: 'url(x)' }).success).toBe(false);
  });
});
