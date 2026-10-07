/** Minúsculas, sin acentos y con espacios colapsados: base para comparaciones tolerantes. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
