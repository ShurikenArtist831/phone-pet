export type PetState = 'angry' | 'happy' | 'comfortable' | 'sleeping';
export type DeviceRole = 'controller' | 'viewer';

export interface PetSnapshot {
  id: string;
  name: string;
  state: PetState;
  version: number;
}

export interface DeviceCredential {
  petId: string;
  role: DeviceRole;
  token: string;
}

export interface PairingResult {
  pet: PetSnapshot;
  device: DeviceCredential;
}

export const petCopy: Record<PetState, { label: string; note: string }> = {
  angry: { label: '生气', note: '哼，我现在有一点点不开心' },
  happy: { label: '开心', note: '今天也有好多开心的事！' },
  comfortable: { label: '舒服', note: '暖暖的，放松一下真舒服' },
  sleeping: { label: '睡觉', note: '晚安，做个好梦 ✨' },
};

export function isPetState(value: unknown): value is PetState {
  return typeof value === 'string' && Object.hasOwn(petCopy, value);
}
