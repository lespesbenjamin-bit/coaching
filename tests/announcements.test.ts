import { describe, it, expect } from 'vitest';
import { announcementInput, announcementState } from '../src/lib/announcements';

const base = { kicker: '', title: 'Offre de Noël', body: '', price_label: '', cta_label: '', cta_url: '', theme: 'volt', starts_on: '', ends_on: '', sort: '0' };
describe('actualités : validation', () => {
  it('accepte une actualité minimale', () => expect(announcementInput.safeParse(base).success).toBe(true));
  it('accepte un bouton vers une page du site ou https', () => {
    expect(announcementInput.safeParse({ ...base, cta_label: 'Offrir', cta_url: '/bon-cadeau' }).success).toBe(true);
    expect(announcementInput.safeParse({ ...base, cta_label: 'Offrir', cta_url: 'https://exemple.fr/x' }).success).toBe(true);
  });
  it('refuse javascript:, http:, data: et les liens sans texte de bouton', () => {
    for (const u of ['javascript:alert(1)', 'http://exemple.fr', 'data:text/html,x', '//evil.fr/x'.replace('//', 'x//')]) expect(announcementInput.safeParse({ ...base, cta_label: 'Go', cta_url: u }).success).toBe(false);
    expect(announcementInput.safeParse({ ...base, cta_url: '/bon-cadeau' }).success).toBe(false);
    expect(announcementInput.safeParse({ ...base, cta_label: 'Go' }).success).toBe(false);
  });
  it('refuse titre vide, thème inconnu, fin avant début', () => {
    expect(announcementInput.safeParse({ ...base, title: '' }).success).toBe(false);
    expect(announcementInput.safeParse({ ...base, theme: 'rouge' }).success).toBe(false);
    expect(announcementInput.safeParse({ ...base, starts_on: '2026-12-10', ends_on: '2026-12-01' }).success).toBe(false);
  });
});
describe('actualités : période d’affichage', () => {
  const today = '2026-12-10';
  it('sans dates : visible', () => expect(announcementState({ active: true, starts_on: null, ends_on: null }, today)).toBe('live'));
  it('dernier jour inclus', () => expect(announcementState({ active: true, starts_on: null, ends_on: '2026-12-10' }, today)).toBe('live'));
  it('lendemain de la fin : terminée', () => expect(announcementState({ active: true, starts_on: null, ends_on: '2026-12-09' }, today)).toBe('expired'));
  it('pas encore commencée : programmée', () => expect(announcementState({ active: true, starts_on: '2026-12-11', ends_on: null }, today)).toBe('scheduled'));
  it('masquée : jamais visible', () => expect(announcementState({ active: false, starts_on: null, ends_on: null }, today)).toBe('off'));
});
