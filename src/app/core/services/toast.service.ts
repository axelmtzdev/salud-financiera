import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  action?: ToastAction;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(message: string, type: ToastType = 'info', options: { action?: ToastAction; duration?: number } = {}): void {
    const toast: Toast = { id: this.nextId++, type, message, action: options.action };
    this._toasts.update((list) => [...list.slice(-3), toast]);
    setTimeout(() => this.dismiss(toast.id), options.duration ?? (options.action ? 6000 : 3500));
  }

  success(message: string, action?: ToastAction): void {
    this.show(message, 'success', { action });
  }

  error(message: string): void {
    this.show(message, 'error', { duration: 5000 });
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
