import { apiFetch } from './api';
import { getTimeContext } from './nutrition';

export interface ProfileOption { id: string; name: string }
export interface EditableProfile {
  firstName: string;
  lastName: string;
  birthDate: string;
  biologicalSex: string | null;
  weightKg: number;
  heightCm: number;
  activityLevel: string;
  goal: string;
  isPCD: boolean;
  allergies: { allergy: ProfileOption }[];
  physicalLimitations: { physicalLimitation: ProfileOption }[];
}

export function getEditableProfile(): Promise<EditableProfile> {
  return apiFetch('/profile');
}

export function updateProfile(data: unknown) {
  const { referenceDate, timezoneOffset } = getTimeContext();
  const query = new URLSearchParams({ referenceDate, timezoneOffset: String(timezoneOffset) });
  return apiFetch(`/profile?${query}`, { method: 'PUT', data });
}
