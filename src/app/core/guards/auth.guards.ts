import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Rutas privadas: requiere sesión. Espera a que se restaure la sesión guardada. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return auth.isAuthenticated() || router.createUrlTree(['/login']);
};

/** Login y registro: con sesión activa se va directo a la app. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return !auth.isAuthenticated() || router.createUrlTree(['/']);
};
