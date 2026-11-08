import { Injectable, signal } from '@angular/core';

export type PetAction = 'Angry' | 'Happy' | 'Comfortable' | 'Sleep';

const actionCopy: Record<PetAction, { label: string; note: string }> = {
  Angry: { label: '有点生气', note: '哼，我现在有一点点不开心' },
  Happy: { label: '开心', note: '今天也有好多开心的事！' },
  Comfortable: { label: '舒服', note: '暖暖的，放松一下真舒服' },
  Sleep: { label: '睡觉', note: '晚安，做个好梦 ✨' },
};

@Injectable({ providedIn: 'root' })
export class MockPetService {
  readonly action = signal<PetAction>('Happy');
  readonly copy = signal(actionCopy.Happy);

  setAction(action: PetAction): void {
    this.action.set(action);
    this.copy.set(actionCopy[action]);
  }
}
