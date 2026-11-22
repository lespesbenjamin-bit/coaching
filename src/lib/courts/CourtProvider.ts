/**
 * Interface d'intégration des terrains, indépendante du fournisseur.
 * AUCUNE intégration Coins n'existe aujourd'hui : ne jamais annoncer de synchronisation active.
 */
export interface CourtAvailability { available: boolean | null; source: 'manual' | 'provider' }

export interface CourtProvider {
  readonly name: string;
  readonly syncEnabled: boolean;
  checkAvailability(courtId: string | null, startsAt: string, endsAt: string): Promise<CourtAvailability>;
}

/** Implémentation actuelle : le coach déclare lui-même si le terrain est sécurisé. */
export class ManualCourtProvider implements CourtProvider {
  readonly name = 'manual';
  readonly syncEnabled = false;
  async checkAvailability(): Promise<CourtAvailability> {
    return { available: null, source: 'manual' };   // inconnu : aucune confirmation automatique implicite
  }
}

export const courtProvider: CourtProvider = new ManualCourtProvider();
