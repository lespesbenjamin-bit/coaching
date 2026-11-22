export type BookingMode = 'auto' | 'manual';
export type BookingStatus = 'pending' | 'confirmed' | 'refused' | 'cancelled' | 'completed';

/** Un cours n'est confirmé automatiquement que si le mode est auto ET le terrain explicitement sécurisé. */
export function initialStatus(mode: BookingMode, courtSecured: boolean): BookingStatus {
  return mode === 'auto' && courtSecured ? 'confirmed' : 'pending';
}

export const HOLDING_STATUSES: BookingStatus[] = ['pending', 'confirmed'];

export function seatsLeft(capacity: number, bookings: { participants: number; status: BookingStatus }[]) {
  const taken = bookings.filter(b => HOLDING_STATUSES.includes(b.status)).reduce((n, b) => n + b.participants, 0);
  return Math.max(0, capacity - taken);
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'En attente de validation',
  confirmed: 'Confirmée',
  refused: 'Refusée',
  cancelled: 'Annulée',
  completed: 'Terminée',
};

const ALLOWED: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'refused', 'cancelled'],
  confirmed: ['cancelled', 'completed'],
  refused: [],
  cancelled: [],
  completed: [],
};
export function canTransition(from: BookingStatus, to: BookingStatus) {
  return ALLOWED[from].includes(to);
}
