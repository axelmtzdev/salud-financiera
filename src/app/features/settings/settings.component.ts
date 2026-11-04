import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { FinanceService } from '../../core/services/finance.service';
import { StorageService } from '../../core/services/storage.service';
import { ToastService } from '../../core/services/toast.service';
import { CardComponent } from '../../shared/components/card/card.component';
import { CATEGORY_MAX_LENGTH, MOVEMENT_TYPE_LABEL, RETENTION_YEARS } from '../../shared/models/categories';
import { MOVEMENT_TYPES, MovementType } from '../../shared/models/finance.models';
import { todayIso } from '../../shared/utils/date.utils';
import { downloadFile, movementsToCsv } from '../../shared/utils/file.utils';
import { FinanceValidators } from '../../shared/validators/finance.validators';
import { PASSWORD_MIN_LENGTH } from '../auth/register/register.component';
import { QuickAddSettingsComponent } from './quick-add-settings/quick-add-settings.component';

type BusyAction = 'profile' | 'password' | 'delete' | 'legacy';

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Ocurrió un error inesperado.');

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, CardComponent, LucideDynamicIcon, QuickAddSettingsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly auth = inject(AuthService);
  protected readonly finance = inject(FinanceService);
  protected readonly storage = inject(StorageService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly types = MOVEMENT_TYPES;
  protected readonly typeLabel = MOVEMENT_TYPE_LABEL;
  protected readonly categoryMax = CATEGORY_MAX_LENGTH;
  protected readonly retentionYears = RETENTION_YEARS;
  protected readonly passwordMin = PASSWORD_MIN_LENGTH;
  protected readonly email = computed(() => this.auth.user()?.email ?? '');
  /** Acción esperando respuesta del servidor (evita dobles envíos). */
  protected readonly busy = signal<BusyAction | null>(null);

  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly profile = this.fb.group({
    name: [this.auth.userName(), [Validators.required, Validators.maxLength(30), FinanceValidators.notBlank]],
  });
  protected readonly password = this.fb.group({
    current: ['', [Validators.required]],
    next: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
    confirm: ['', [Validators.required, FinanceValidators.sameAs('next')]],
  });
  protected readonly passwordError = signal<string | null>(null);
  protected readonly deletion = this.fb.group({ password: ['', [Validators.required]] });
  protected readonly deleteError = signal<string | null>(null);

  protected readonly newCategory: Record<MovementType, FormControl<string>> = {
    ingreso: new FormControl('', { nonNullable: true }),
    egreso: new FormControl('', { nonNullable: true }),
  };
  protected readonly categoryError = signal<Partial<Record<MovementType, string>>>({});

  protected readonly movementCount = computed(() => this.finance.movements().length);

  constructor() {
    const { next, confirm } = this.password.controls;
    next.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => confirm.updateValueAndValidity());
  }

  protected invalid(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  protected async saveProfile(): Promise<void> {
    if (this.profile.invalid) {
      this.profile.markAllAsTouched();
      return;
    }
    await this.run('profile', async () => {
      await this.auth.updateName(this.profile.getRawValue().name);
      this.profile.reset({ name: this.auth.userName() });
      this.toast.success('Nombre actualizado');
    });
  }

  protected async changePassword(): Promise<void> {
    this.passwordError.set(null);
    if (this.password.invalid) {
      this.password.markAllAsTouched();
      return;
    }
    const { current, next } = this.password.getRawValue();
    await this.run('password', async () => {
      try {
        await this.auth.changePassword(current, next);
      } catch (err) {
        this.passwordError.set(errorMessage(err));
        return;
      }
      this.password.reset();
      this.toast.success('Contraseña actualizada. Se cerró la sesión en tus otros dispositivos.');
    });
  }

  protected async deleteAccount(): Promise<void> {
    this.deleteError.set(null);
    if (this.deletion.invalid) {
      this.deleteError.set('Escribe tu contraseña para confirmar.');
      return;
    }
    const ok = await this.confirm.ask({
      title: 'Eliminar mi cuenta',
      message: `Se borrarán tu cuenta (${this.email()}) y todos tus movimientos, presupuestos y pagos del servidor, en todos tus dispositivos. Te recomendamos descargar un respaldo antes. No se puede deshacer.`,
      confirmText: 'Eliminar cuenta',
      danger: true,
    });
    if (!ok) return;
    await this.run('delete', async () => {
      try {
        await this.auth.deleteAccount(this.deletion.getRawValue().password);
      } catch (err) {
        this.deleteError.set(errorMessage(err));
        return;
      }
      this.toast.show('Tu cuenta se eliminó.');
      this.router.navigate(['/registro']);
    });
  }

  protected async importLegacy(): Promise<void> {
    await this.run('legacy', async () => {
      if (await this.storage.importLegacy()) this.toast.success('Tus datos se subieron a tu cuenta');
    });
  }

  protected async discardLegacy(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Descartar datos de este navegador',
      message: 'Dejarán de ofrecerse para subir. Se guarda una copia oculta en este navegador por si la necesitas después.',
      confirmText: 'Descartar',
    });
    if (ok) this.storage.archiveLegacy();
  }

  /** Marca la acción como ocupada mientras responde el servidor; los errores no previstos se muestran como aviso. */
  private async run(action: BusyAction, task: () => Promise<void>): Promise<void> {
    this.busy.set(action);
    try {
      await task();
    } catch (err) {
      this.toast.error(errorMessage(err));
    } finally {
      this.busy.set(null);
    }
  }

  protected addCategory(type: MovementType): void {
    const result = this.finance.addCategory(type, this.newCategory[type].value);
    if (!result.ok) {
      this.categoryError.update((e) => ({ ...e, [type]: result.error }));
      return;
    }
    this.categoryError.update((e) => ({ ...e, [type]: undefined }));
    this.newCategory[type].reset('');
    this.toast.success(`Categoría "${result.name}" creada`);
  }

  protected async removeCategory(type: MovementType, name: string): Promise<void> {
    const used = this.finance.countByCategory(type, name);
    const ok = await this.confirm.ask({
      title: 'Eliminar categoría',
      message: used
        ? `"${name}" se usa en ${used} movimiento(s). Esos movimientos conservarán la categoría, pero ya no aparecerá al registrar nuevos.`
        : `¿Eliminar la categoría "${name}"?`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    if (this.finance.removeCategory(type, name)) this.toast.success(`Categoría "${name}" eliminada`);
  }

  protected exportCsv(): void {
    downloadFile(movementsToCsv(this.finance.movements()), `movimientos-${todayIso()}.csv`, 'text/csv;charset=utf-8');
    this.toast.success('CSV exportado');
  }

  protected exportJson(): void {
    downloadFile(this.finance.exportJson(), `respaldo-salud-financiera-${todayIso()}.json`, 'application/json');
    this.toast.success('Respaldo descargado');
  }

  protected async importJson(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    const ok = await this.confirm.ask({
      title: 'Restaurar respaldo',
      message: `Se reemplazarán tus ${this.movementCount()} movimientos y categorías actuales con el contenido de "${file.name}", en todos tus dispositivos. Tu cuenta no cambia.`,
      confirmText: 'Restaurar',
      danger: true,
    });
    if (!ok) return;
    const result = this.finance.importJson(await file.text());
    if (result.ok) this.toast.success(`Respaldo restaurado: ${result.count} movimientos`);
    else this.toast.error(result.error);
  }

  protected loadSample(): void {
    const count = this.finance.loadSampleData();
    if (count) this.toast.success(`Se agregaron ${count} movimientos de ejemplo`);
  }

  protected async clearMovements(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Borrar movimientos',
      message: `Se eliminarán los ${this.movementCount()} movimientos registrados. Te recomendamos descargar un respaldo antes. Esta acción no se puede deshacer.`,
      confirmText: 'Borrar movimientos',
      danger: true,
    });
    if (!ok) return;
    if (this.finance.clearMovements()) this.toast.success('Movimientos eliminados');
  }
}
