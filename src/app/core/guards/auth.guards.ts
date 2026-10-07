import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Rutas privadas: requiere configuración inicial y sesión activa. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isConfigured()) return router.createUrlTree(['/bienvenida']);
  return auth.isAuthenticated() || router.createUrlTree(['/login']);
};

export const loginGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isConfigured()) return router.createUrlTree(['/bienvenida']);
  return !auth.isAuthenticated() || router.createUrlTree(['/']);
};

export const setupGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isConfigured()) return true;
  return router.createUrlTree([auth.isAuthenticated() ? '/' : '/login']);
};
