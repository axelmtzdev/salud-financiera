import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { AccountsService } from '../../core/services/accounts.service';
import { GoalsService } from '../../core/services/goals.service';
import { ACCOUNT_ICON, ACCOUNT_LABEL } from '../../shared/models/categories';
import { ACCOUNT_KINDS } from '../../shared/models/finance.models';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';

/** Saldo disponible total y por cuenta, para la pantalla principal. Sin saldo inicial invita a capturarlo. */
@Component({
  selector: 'app-balance-summary',
  imports: [RouterLink, LucideDynamicIcon, CurrencyFormatPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (accounts.balances(); as b) {
      <a class="saldo" routerLink="/cuentas" aria-label="Ver cuentas">
        <div class="saldo__total">
          <span class="etiqueta">Saldo disponible</span>
          <strong class="saldo__valor pc-num" [class.text-expense]="b.total < 0">{{ b.total | currencyFormat }}</strong>
          @if (goals.reservedTotal() > 0) {
            <span class="saldo__ayuda pc-num">
              Libre {{ goals.free()!.total | currencyFormat }} · {{ goals.reservedTotal() | currencyFormat }} apartado para metas
            </span>
          } @else {
            <span class="saldo__ayuda">En tus cuentas al día de hoy</span>
          }
        </div>
        <ul class="saldo__cuentas">
          @for (kind of kinds; track kind) {
            <li>
              <span class="saldo__cuenta"><svg [lucideIcon]="icon[kind]" [size]="15" aria-hidden="true"></svg> {{ label[kind] }}</span>
              <strong class="pc-num" [class.text-expense]="b[kind].balance < 0">{{ b[kind].balance | currencyFormat }}</strong>
            </li>
          }
        </ul>
        <svg class="saldo__flecha" lucideIcon="chevron-right" [size]="16" aria-hidden="true"></svg>
      </a>
    } @else {
      <a class="saldo saldo--vacio" routerLink="/cuentas">
        <span class="saldo__icono"><svg lucideIcon="landmark" [size]="18" aria-hidden="true"></svg></span>
        <span class="saldo__invitacion">
          <strong>Agrega tu saldo inicial</strong>
          <span>Captura cuánto tienes en efectivo y en tu cuenta para ver tu saldo disponible, no solo el del mes.</span>
        </span>
        <svg class="saldo__flecha" lucideIcon="chevron-right" [size]="16" aria-hidden="true"></svg>
      </a>
    }
  `,
  styles: `
    :host { display: block; }
    .saldo {
      position: relative;
      display: grid;
      gap: 16px;
      padding: 20px 44px 20px 20px;
      color: inherit;
      text-decoration: none;
      background: var(--surface-elevada);
      border: 1px solid transparent;
      border-radius: var(--radius-xl);
      box-shadow: var(--sombra-elevada);
      transition: border-color var(--duracion-color) ease;
    }
    :host-context(.dark) .saldo { border-color: var(--border); }
    .saldo:hover { border-color: var(--ring); }
    .saldo:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
    .saldo__total { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .saldo__valor { font-size: 30px; line-height: 36px; font-weight: 600; letter-spacing: -0.025em; }
    .saldo__ayuda { font-size: 12px; color: var(--texto-tenue); }
    .saldo__cuentas { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .saldo__cuentas li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: var(--radius);
      background: var(--surface);
      border: 1px solid var(--border-suave);
      font-size: 13px;
    }
    .saldo__cuenta { display: inline-flex; align-items: center; gap: 6px; color: var(--muted-foreground); font-weight: 500; }
    .saldo__flecha { position: absolute; top: 50%; right: 16px; transform: translateY(-50%); color: var(--texto-tenue); }
    @media (min-width: 720px) {
      .saldo { grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); align-items: center; }
      .saldo__cuentas { grid-template-columns: 1fr 1fr; }
      .saldo__cuentas li { flex-direction: column; align-items: flex-start; gap: 4px; }
      .saldo__cuentas strong { font-size: 18px; }
    }
    .saldo--vacio { display: flex; align-items: center; gap: 14px; }
    .saldo__icono {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: var(--radius);
      color: var(--texto-activo);
      background: var(--accent);
    }
    .saldo__invitacion { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
    .saldo__invitacion span { color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
  `,
})
export class BalanceSummaryComponent {
  protected readonly accounts = inject(AccountsService);
  protected readonly goals = inject(GoalsService);
  protected readonly kinds = ACCOUNT_KINDS;
  protected readonly label = ACCOUNT_LABEL;
  protected readonly icon = ACCOUNT_ICON;
}
