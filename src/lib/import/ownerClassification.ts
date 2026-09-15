import { matchAddresses, type AddressMatchStatus } from '@/lib/addressMatch';
import type { Building } from '@/types';

/** Composes a building's separate address fields into one comparable free-text string. */
export function buildingFullAddress(b: Pick<Building, 'address' | 'addressLine2' | 'locality' | 'adminArea' | 'postalCode' | 'countryCode'> | undefined | null): string {
  if (!b) return '';
  return [b.address, b.addressLine2, b.locality, b.adminArea, b.postalCode, b.countryCode]
    .filter((s) => s && s.trim())
    .join(', ');
}

export interface OwnerResidencyInput {
  /** Raw address text entered/imported for the owner, if any. */
  ownerAddress: string;
  /** Composed full address text of the flat's building (see buildingFullAddress). */
  buildingAddress: string;
  /** An explicit "Also Resident" Yes from the file/person - always wins over address inference, since real stated intent should never be second-guessed by a heuristic. */
  explicitResident?: boolean;
}

export interface OwnerResidencyResult {
  isResident: boolean;
  /** Why - surfaced in Bulk Add row notes / audit log, never silently discarded. */
  status: AddressMatchStatus;
}

/**
 * Single source of truth for the "Owner + Resident (owner-occupied)" vs
 * "Owner only" rule used by the Owners Bulk Add flow:
 *   - an explicit "Also Resident" Yes always wins
 *   - otherwise, a confident (normalized) address match against the matched
 *     building makes them a resident
 *   - a weak/ambiguous partial match is never assumed either way - it's
 *     classified as Owner only for now, with `status: 'review'` so the
 *     caller can flag the row for a person to confirm, instead of the
 *     system guessing at owner-occupancy from a shaky signal
 *   - no address on file (or no building matched yet) is 'none' - Owner only
 */
export function classifyOwnerResidency(input: OwnerResidencyInput): OwnerResidencyResult {
  if (input.explicitResident) return { isResident: true, status: 'match' };
  const status = matchAddresses(input.ownerAddress, input.buildingAddress);
  return { isResident: status === 'match', status };
}
