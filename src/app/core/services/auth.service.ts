import { Injectable, computed, inject, signal } from '@angular/core';
import { UserProfile } from '../../shared/models/finance.models';
import { uuid } from '../../shared/utils/id.utils';
import { sha256 } from '../../shared/utils/sha256';
import { collapseSpaces, normalizeText } from '../../shared/utils/text.utils';
import { StorageService } from './storage.service';

const SESSION_KEY = 'salud-financiera.session';

export interface ProfileInput {
  name: string;
  secretQuestion: string;
  /** Si se omite se conserva la respuesta actual */
  secretAnswer?: string;
}

/** Normaliza la respuesta: sin distinguir mayúsculas, acentos ni espacios extra. */
export function hashAnswer(answer: string, salt: string): string {
  return sha256(`${salt}:${normalizeText(answer)}`);
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storage = inject(StorageService);

  readonly user = computed(() => this.storage.state().user);
  readonly isConfigured = computed(() => this.user() !== null);
  readonly userName = computed(() => this.user()?.name ?? '');
  readonly secretQuestion = computed(() => this.user()?.secretQuestion ?? '');

  /** Token de sesión ligado al salt del usuario: si se restablece la app, la sesión deja de ser válida. */
  private readonly sessionToken = signal<string | null>(this.readSession());
  readonly isAuthenticated = computed(() => {
    const user = this.user();
    return user !== null && this.sessionToken() === user.salt;
  });

  setup(input: Required<ProfileInput>): boolean {
    const salt = uuid();
    const user: UserProfile = {
      name: collapseSpaces(input.name),
      secretQuestion: collapseSpaces(input.secretQuestion),
      secretAnswer: hashAnswer(input.secretAnswer, salt),
      salt,
    };
    if (!this.storage.update((data) => ({ ...data, user }))) return false;
    this.startSession(salt);
    return true;
  }

  verify(answer: string): boolean {
    const user = this.user();
    return user !== null && hashAnswer(answer, user.salt) === user.secretAnswer;
  }

  login(answer: string): boolean {
    if (!this.verify(answer)) return false;
    this.startSession(this.user()!.salt);
    return true;
  }

  logout(): void {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
    this.sessionToken.set(null);
  }

  updateProfile(input: ProfileInput): boolean {
    const current = this.user();
    if (!current) return false;
    const salt = input.secretAnswer ? uuid() : current.salt;
    const user: UserProfile = {
      name: collapseSpaces(input.name),
      secretQuestion: collapseSpaces(input.secretQuestion),
      secretAnswer: input.secretAnswer ? hashAnswer(input.secretAnswer, salt) : current.secretAnswer,
      salt,
    };
    if (!this.storage.update((data) => ({ ...data, user }))) return false;
    this.startSession(salt);
    return true;
  }

  private startSession(token: string): void {
    try {
      sessionStorage.setItem(SESSION_KEY, token);
    } catch {
      /* la sesión vivirá solo en memoria */
    }
    this.sessionToken.set(token);
  }

  private readSession(): string | null {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  }
}
