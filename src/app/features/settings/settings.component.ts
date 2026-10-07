import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { QuickAddSettingsComponent } from './quick-add-settings/quick-add-settings.component';

/** Límite típico de localStorage por origen. */
const STORAGE_QUOTA = 5 * 1024 * 1024;

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
  private readonly storage = inject(StorageService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly types = MOVEMENT_TYPES;
  protected readonly typeLabel = MOVEMENT_TYPE_LABEL;
  protected readonly categoryMax = CATEGORY_MAX_LENGTH;
  protected readonly retentionYears = RETENTION_YEARS;

  protected readonly profile = inject(FormBuilder).nonNullable.group({
    name: [this.auth.userName(), [Validators.required, Validators.maxLength(30), FinanceValidators.notBlank]],
    secretQuestion: [this.auth.secretQuestion(), [Validators.required, Validators.maxLength(100), FinanceValidators.notBlank]],
    currentAnswer: ['', [Validators.required]],
    newAnswer: ['', [Validators.minLength(2)]],
  });
  protected readonly profileError = signal<string | null>(null);

  protected readonly newCategory: Record<MovementType, FormControl<string>> = {
    ingreso: new FormControl('', { nonNullable: true }),
    egreso: new FormControl('', { nonNullable: true }),
  };
  protected readonly categoryError = signal<Partial<Record<MovementType, string>>>({});

  protected readonly movementCount = computed(() => this.finance.movements().length);
  protected readonly usage = computed(() => {
    this.storage.state(); // recalcula cuando cambian los datos
    const bytes = this.storage.usageBytes();
    return { kb: (bytes / 1024).toFixed(1), percent: Math.min(100, (bytes / STORAGE_QUOTA) * 100) };
  });

  protected profileInvalid(name: 'name' | 'secretQuestion' | 'currentAnswer' | 'newAnswer'): boolean {
    const control = this.profile.controls[name];
    return control.invalid && control.touched;
  }

  protected saveProfile(): void {
    this.profileError.set(null);
    if (this.profile.invalid) {
      this.profile.markAllAsTouched();
      return;
    }
    const { name, secretQuestion, currentAnswer, newAnswer } = this.profile.getRawValue();
    if (!this.auth.verify(currentAnswer)) {
      this.profileError.set('La respuesta actual no es correcta.');
      return;
    }
    const ok = this.auth.updateProfile({ name, secretQuestion, secretAnswer: newAnswer.trim() || undefined });
    if (!ok) {
      this.toast.error('No se pudo guardar el perfil.');
      return;
    }
    this.profile.reset({ name: this.auth.userName(), secretQuestion: this.auth.secretQuestion(), currentAnswer: '', newAnswer: '' });
    this.toast.success('Perfil actualizado');
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
      message: `Se reemplazarán tus ${this.movementCount()} movimientos y categorías actuales con el contenido de "${file.name}". Tu acceso no cambia.`,
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

  protected async resetApp(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Restablecer la aplicación',
      message: 'Se borrarán tu usuario, pregunta secreta, movimientos y categorías de este navegador. Esta acción no se puede deshacer.',
      confirmText: 'Borrar todo',
      danger: true,
    });
    if (!ok) return;
    this.storage.reset();
    this.auth.logout();
    this.router.navigate(['/bienvenida']);
  }
}
