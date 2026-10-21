import { MORE_GROUPS, NAV_GROUPS, TAB_LINKS, TAB_PATHS, isInMore } from './nav.config';

describe('nav.config', () => {
  it('la barra inferior no pasa de 5 lugares (secciones + botón central + Más)', () => {
    expect(TAB_LINKS.length + 2).toBeLessThanOrEqual(5);
    expect(TAB_LINKS.every(Boolean)).toBeTrue();
  });

  it('cada sección aparece una sola vez: en la barra inferior o en "Más"', () => {
    const all = NAV_GROUPS.flatMap((g) => g.links.map((l) => l.path));
    const inMore = MORE_GROUPS.flatMap((g) => g.links.map((l) => l.path));
    expect(new Set(all).size).toBe(all.length);
    expect([...TAB_PATHS, ...inMore].sort()).toEqual([...all].sort());
  });

  it('marca "Más" solo en sus secciones, incluidas sus subrutas', () => {
    expect(isInMore('/preguntas')).toBeTrue();
    expect(isInMore('/ajustes?tab=datos')).toBeTrue();
    expect(isInMore('/movimientos')).toBeFalse();
    expect(isInMore('/movimientos/nuevo')).toBeFalse();
    expect(isInMore('/presupuestos')).toBeFalse();
  });
});
