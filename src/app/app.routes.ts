import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'control', loadComponent: () => import('./pages/control.page').then((m) => m.ControlPage) },
  { path: 'viewer', loadComponent: () => import('./pages/viewer.page').then((m) => m.ViewerPage) },
  { path: '', pathMatch: 'full', redirectTo: 'control' },
  { path: '**', redirectTo: 'control' },
];
