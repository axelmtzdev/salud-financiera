import { Routes } from '@angular/router';
import { authGuard, loginGuard, setupGuard } from './core/guards/auth.guards';

export const routes: Routes = [
  {
    path: 'bienvenida',
    title: 'Configuración inicial · Salud Financiera',
    canActivate: [setupGuard],
    loadComponent: () => import('./features/auth/setup/setup.component').then((m) => m.SetupComponent),
  },
  {
    path: 'login',
    title: 'Iniciar sesión · Salud Financiera',
    canActivate: [loginGuard],
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    // Sin guard: la abre el atajo del iPhone y solo deja el cargo en la bandeja
    path: 'registro-rapido',
    title: 'Registro rápido · Salud Financiera',
    loadComponent: () => import('./features/quick-add/quick-add.component').then((m) => m.QuickAddComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadComponent: () => import('./core/layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'movimientos' },
      {
        path: 'movimientos',
        title: 'Movimientos · Salud Financiera',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'movimientos/nuevo',
        title: 'Registrar movimiento · Salud Financiera',
        loadComponent: () =>
          import('./features/dashboard/movement-form/movement-form.component').then((m) => m.MovementFormComponent),
      },
      {
        path: 'movimientos/:id',
        title: 'Detalle de movimiento · Salud Financiera',
        loadComponent: () =>
          import('./features/dashboard/movement-detail/movement-detail.component').then(
            (m) => m.MovementDetailComponent,
          ),
      },
      {
        path: 'movimientos/:id/editar',
        title: 'Editar movimiento · Salud Financiera',
        loadComponent: () =>
          import('./features/dashboard/movement-form/movement-form.component').then((m) => m.MovementFormComponent),
      },
      {
        path: 'analisis',
        title: 'Análisis · Salud Financiera',
        loadComponent: () => import('./features/analytics/analytics.component').then((m) => m.AnalyticsComponent),
      },
      {
        path: 'ajustes',
        title: 'Ajustes · Salud Financiera',
        loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
