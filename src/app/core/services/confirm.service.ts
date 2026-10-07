import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/** Diálogo de confirmación basado en promesas; lo renderiza `ConfirmDialogComponent`. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly _request = signal<ConfirmRequest | null>(null);
  readonly request = this._request.asReadonly();

  ask(options: ConfirmOptions): Promise<boolean> {
    this._request()?.resolve(false);
    return new Promise((resolve) => this._request.set({ ...options, resolve }));
  }

  close(result: boolean): void {
    const request = this._request();
    if (!request) return;
    this._request.set(null);
    request.resolve(result);
  }
}
