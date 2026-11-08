import { Routes } from '@angular/router';
import { adminGuard } from './admin/admin.guard';

export const routes: Routes = [
  { path: 'control', loadComponent: () => import('./pages/control.page').then((m) => m.ControlPage) },
  { path: 'viewer', loadComponent: () => import('./pages/viewer.page').then((m) => m.ViewerPage) },
  { path: 'join/:token', loadComponent: () => import('./pages/join.page').then((m) => m.JoinPage) },
  {
    path: 'admin/login',
    loadComponent: () => import('./admin/login.page').then((m) => m.AdminLoginPage),
  },
  {
    path: 'admin/pairings',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/pairings.page').then((m) => m.AdminPairingsPage),
  },
  { path: 'admin', pathMatch: 'full', redirectTo: 'admin/pairings' },
  { path: '', pathMatch: 'full', redirectTo: 'control' },
  { path: '**', redirectTo: 'control' },
];
