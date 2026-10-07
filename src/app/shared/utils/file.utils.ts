import { MOVEMENT_TYPE_LABEL } from '../models/categories';
import { Movement } from '../models/finance.models';

/** Escapa un campo CSV y neutraliza fórmulas (=, +, -, @) para evitar inyección al abrirlo en Excel. */
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function movementsToCsv(movements: readonly Movement[]): string {
  const header = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto'];
  const rows = movements.map((m) => [
    m.date,
    MOVEMENT_TYPE_LABEL[m.type],
    csvField(m.category),
    csvField(m.description),
    (m.type === 'egreso' ? -m.amount : m.amount).toFixed(2),
  ]);
  // BOM para que Excel reconozca UTF-8 (acentos)
  return '﻿' + [header, ...rows].map((r) => r.join(',')).join('\r\n');
}

export function downloadFile(content: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
