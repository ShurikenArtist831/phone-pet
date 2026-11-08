import { Injectable } from '@angular/core';
import type { DeviceCredential, DeviceRole, PairingResult, PetSnapshot, PetState } from './pet-state';

export class PetApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

@Injectable({ providedIn: 'root' })
export class PetApiService {
  getDevice(role: DeviceRole): DeviceCredential | null {
    try {
      const device = JSON.parse(localStorage.getItem(`huhu-vide.${role}`) ?? 'null');
      if (device?.role === role && typeof device.petId === 'string' &&
          typeof device.token === 'string' && /^[a-f0-9]{64}$/.test(device.token)) {
        return device;
      }
    } catch {
      // An unavailable or malformed local credential is treated as unpaired.
    }
    return null;
  }

  async createPet(): Promise<PairingResult> {
    const result = await this.request<PairingResult>('/api/pets', 'POST');
    this.saveDevice(result.device);
    return result;
  }

  async claimInvite(token: string): Promise<PairingResult> {
    const result = await this.request<PairingResult>('/api/invites/claim', 'POST', undefined, { token });
    this.saveDevice(result.device);
    return result;
  }

  getPet(device: DeviceCredential, signal?: AbortSignal): Promise<PetSnapshot> {
    return this.request<PetSnapshot>(this.petPath(device), 'GET', device, undefined, signal);
  }

  setState(device: DeviceCredential, state: PetState): Promise<PetSnapshot> {
    return this.request<PetSnapshot>(`${this.petPath(device)}/state`, 'PATCH', device, { state });
  }

  createInvite(device: DeviceCredential): Promise<{ path: string; expiresAt: string }> {
    return this.request(`${this.petPath(device)}/invites`, 'POST', device);
  }

  private saveDevice(device: DeviceCredential): void {
    try {
      localStorage.setItem(`huhu-vide.${device.role}`, JSON.stringify(device));
    } catch {
      throw new Error('无法保存设备凭证，请检查浏览器的存储设置');
    }
  }

  private petPath(device: DeviceCredential): string {
    return `/api/pets/${encodeURIComponent(device.petId)}`;
  }

  private async request<T>(
    path: string,
    method: string,
    device?: DeviceCredential,
    body?: object,
    signal?: AbortSignal,
  ): Promise<T> {
    const headers = new Headers({ Accept: 'application/json' });
    if (device) headers.set('Authorization', `Bearer ${device.token}`);
    if (body) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetch(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal,
        cache: 'no-store',
        redirect: 'error',
      });
    } catch {
      throw new Error('连接失败，请检查网络后重试');
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('无法连接乎乎服务，请稍后再试');
    }
    if (!response.ok) {
      throw new PetApiError(response.status, typeof data?.error === 'string' ? data.error : '请求失败，请稍后再试');
    }
    return data as T;
  }
}
