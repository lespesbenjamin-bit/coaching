import { describe, it, expect } from 'vitest';
import { initialStatus, seatsLeft, canTransition } from '../src/lib/booking-rules';
import { bookingInput, sessionInput } from '../src/lib/validation';
import { parisToUtcIso, formatTime, dayKey } from '../src/lib/dates';

describe('règles de réservation', () => {
  it('confirme automatiquement seulement si auto ET terrain sécurisé', () => {
    expect(initialStatus('auto', true)).toBe('confirmed');
    expect(initialStatus('auto', false)).toBe('pending');
    expect(initialStatus('manual', true)).toBe('pending');
    expect(initialStatus('manual', false)).toBe('pending');
  });
  it('calcule les places restantes (demandes en attente incluses, refus/annulations exclus)', () => {
    expect(seatsLeft(4, [{ participants: 1, status: 'confirmed' }, { participants: 2, status: 'pending' }, { participants: 1, status: 'cancelled' }, { participants: 1, status: 'refused' }])).toBe(1);
    expect(seatsLeft(1, [{ participants: 1, status: 'pending' }])).toBe(0);
    expect(seatsLeft(2, [{ participants: 5, status: 'confirmed' }])).toBe(0);
  });
  it('autorise seulement les transitions de statut cohérentes', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('pending', 'refused')).toBe(true);
    expect(canTransition('refused', 'confirmed')).toBe(false);
    expect(canTransition('cancelled', 'confirmed')).toBe(false);
    expect(canTransition('confirmed', 'refused')).toBe(false);
  });
});

describe('validation', () => {
  const ok = { sessionId: '3f2c8f9e-1b7a-4c1d-9e2a-1234567890ab', firstName: 'Léa', lastName: 'Martin', email: 'lea@example.com', phone: '06 12 34 56 78', participants: 1, idempotencyKey: 'a'.repeat(20) };
  it('accepte une réservation valide', () => expect(bookingInput.safeParse(ok).success).toBe(true));
  it('refuse e-mail, téléphone, UUID invalides', () => {
    expect(bookingInput.safeParse({ ...ok, email: 'pas-un-mail' }).success).toBe(false);
    expect(bookingInput.safeParse({ ...ok, phone: 'abc<script>' }).success).toBe(false);
    expect(bookingInput.safeParse({ ...ok, sessionId: 'x' }).success).toBe(false);
  });
  it('refuse le champ piège rempli', () => expect(bookingInput.safeParse({ ...ok, website: 'http://spam' }).success).toBe(false));
  it('valide la création de créneau', () => {
    expect(sessionInput.safeParse({ courseCode: 'collectif', date: '2026-12-05', time: '18:00', durationMin: 90, bookingMode: 'manual', courtSecured: false, capacity: 4 }).success).toBe(true);
    expect(sessionInput.safeParse({ courseCode: 'x', date: '5/12', time: '18h', durationMin: 90, bookingMode: 'manual', courtSecured: false, capacity: 4 }).success).toBe(false);
  });
});

describe('fuseau Europe/Paris', () => {
  it('convertit heure d’hiver (UTC+1) et heure d’été (UTC+2)', () => {
    expect(parisToUtcIso('2026-12-05', '18:00')).toBe('2026-12-05T17:00:00.000Z');
    expect(parisToUtcIso('2026-07-04', '18:00')).toBe('2026-07-04T16:00:00.000Z');
  });
  it('affiche en heure de Paris', () => {
    expect(formatTime('2026-12-05T17:00:00.000Z')).toBe('18:00');
    expect(dayKey('2026-12-05T23:30:00.000Z')).toBe('2026-12-06');
  });
  it('gère le passage à l’heure d’été (29 mars 2026)', () => {
    expect(parisToUtcIso('2026-03-29', '10:00')).toBe('2026-03-29T08:00:00.000Z');
  });
});
