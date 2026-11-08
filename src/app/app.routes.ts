import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'control', loadComponent: () => import('./pages/control.page').then((m) => m.ControlPage) },
  { path: 'viewer', loadComponent: () => import('./pages/viewer.page').then((m) => m.ViewerPage) },
  { path: 'join/:token', loadComponent: () => import('./pages/join.page').then((m) => m.JoinPage) },
  { path: '', pathMatch: 'full', redirectTo: 'control' },
  { path: '**', redirectTo: 'control' },
];
