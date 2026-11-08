import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { DeviceRole } from '../pet-state';

export interface AdminDevice {
  id: string;
  petId: string;
  petName: string;
  role: DeviceRole;
  displayName: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface AdminPet {
  id: string;
  name: string;
  createdAt: string;
}

export interface AdminPairings {
  devices: AdminDevice[];
  pets: AdminPet[];
}

export interface AdminWidgetToken {
  id: string;
  petId: string;
  petName: string;
  viewerDeviceId: string;
  viewerName: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export function adminError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse && typeof error.error?.error === 'string') {
    return error.error.error;
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);

  session() {
    return this.http.get<{ authenticated: true }>('/api/admin/session');
  }

  login(username: string, password: string): Promise<unknown> {
    return firstValueFrom(this.http.post('/api/admin/login', { username, password }));
  }

  logout(): Promise<unknown> {
    return firstValueFrom(this.http.post('/api/admin/logout', {}));
  }

  list(): Promise<AdminPairings> {
    return firstValueFrom(this.http.get<AdminPairings>('/api/admin/pairings'));
  }

  listWidgets(): Promise<{ widgets: AdminWidgetToken[] }> {
    return firstValueFrom(this.http.get<{ widgets: AdminWidgetToken[] }>('/api/admin/widgets'));
  }

  createWidget(petId: string): Promise<{ widget: AdminWidgetToken & { token: string } }> {
    return firstValueFrom(this.http.post<{ widget: AdminWidgetToken & { token: string } }>(
      '/api/admin/widgets', { petId },
    ));
  }

  revokeWidget(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`/api/admin/widgets/${encodeURIComponent(id)}`));
  }

  invite(petId: string): Promise<{ path: string; expiresAt: string }> {
    return firstValueFrom(this.http.post<{ path: string; expiresAt: string }>(
      '/api/admin/pairings/invites', { petId },
    ));
  }

  edit(deviceId: string, displayName: string): Promise<unknown> {
    return firstValueFrom(this.http.patch('/api/admin/pairings', { deviceId, displayName }));
  }

  revoke(deviceId: string): Promise<unknown> {
    return firstValueFrom(this.http.delete('/api/admin/pairings', { body: { deviceId } }));
  }
}
