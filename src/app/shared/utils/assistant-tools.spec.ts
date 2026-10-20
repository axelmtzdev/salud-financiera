import { AppData, Movement, MovementType, PendingMovement, createEmptyData } from '../models/finance.models';
import { ASSISTANT_TOOLS, SEARCH_MAX_LIMIT, ToolResult, runAssistantTool } from './assistant-tools';

let seq = 0;
const mv = (type: MovementType, category: string, amount: number, date: string, description = ''): Movement => ({
  id: String(++seq),
  type,
  category,
  amount,
  date,
  description,
  createdAt: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
});

const TODAY = '2026-03-20';

const withMovements = (movements: Movement[], extra: Partial<AppData> = {}): AppData => ({
  ...createEmptyData(),
  movements,
  ...extra,
});

const data = withMovements([
  mv('ingreso', 'Salario', 30000, '2026-02-01', 'Nómina'),
  mv('egreso', 'Vivienda', 12000, '2026-02-02', 'Renta'),
  mv('egreso', 'Alimentación', 3000, '2026-02-10', 'Súper'),
  mv('ingreso', 'Salario', 30000, '2026-03-01', 'Nómina'),
  mv('egreso', 'Vivienda', 12000, '2026-03-02', 'Renta'),
  mv('egreso', 'Alimentación', 4500, '2026-03-07', 'Súper'),
  mv('egreso', 'Transporte', 800, '2026-03-09', 'Uber al aeropuerto'),
  mv('egreso', 'Transporte', 350, '2026-03-15', 'UBER'),
]);

const run = (name: string, input: unknown, appData = data) => runAssistantTool(name, input, appData, TODAY);

/** Devuelve el resultado o falla la prueba con el error de la herramienta. */
function ok(result: ToolResult): any {
  if (!result.ok) fail(result.error);
  return result.ok ? result.result : null;
}

const march = { desde: '2026-03-01', hasta: '2026-03-31' };

describe('assistant-tools', () => {
  it('expone definiciones con esquema de objeto cerrado y obligatorios declarados', () => {
    expect(ASSISTANT_TOOLS.length).toBe(8);
    for (const tool of ASSISTANT_TOOLS) {
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.additionalProperties).toBeFalse();
      for (const key of tool.parameters.required) expect(tool.parameters.properties[key]).toBeDefined();
    }
  });

  describe('validación', () => {
    it('rechaza herramientas desconocidas', () => {
      expect(run('borrar_todo', {})).toEqual({ ok: false, error: 'No existe la herramienta "borrar_todo".' });
    });

    it('rechaza parámetros faltantes, desconocidos o con tipo incorrecto', () => {
      const errorOf = (input: unknown) => {
        const result = run('obtener_resumen', input);
        return result.ok ? null : result.error;
      };
      expect(errorOf({ desde: '2026-03-01' })).toContain('hasta');
      expect(errorOf({ ...march, extra: 1 })).toContain('desconocido');
      expect(errorOf({ desde: '2026-02-30', hasta: '2026-03-31' })).toContain('fecha válida');
      expect(errorOf({ desde: 20260301, hasta: '2026-03-31' })).toContain('texto');
      expect(errorOf('marzo')).toContain('objeto');
    });

    it('valida enums y enteros', () => {
      expect(run('desglose_por_categoria', { ...march, tipo: 'gasto' }).ok).toBeFalse();
      expect(run('serie_mensual', { meses: 2.5 }).ok).toBeFalse();
    });

    it('ignora opcionales en null y acepta entrada vacía en herramientas sin parámetros', () => {
      expect(run('buscar_movimientos', { tipo: null, texto: null }).ok).toBeTrue();
      expect(run('listar_categorias', undefined).ok).toBeTrue();
    });
  });

  describe('obtener_resumen', () => {
    it('totaliza el período con tasa de ahorro en porcentaje', () => {
      expect(ok(run('obtener_resumen', march))).toEqual({
        periodo: { from: '2026-03-01', to: '2026-03-31' },
        moneda: 'MXN',
        ingresos: 30000,
        egresos: 17650,
        saldo: 12350,
        tasaAhorroPorcentaje: 41.2,
        movimientos: 5,
      });
    });

    it('intercambia un rango invertido y devuelve null sin ingresos', () => {
      const result = ok(run('obtener_resumen', { desde: '2026-03-31', hasta: '2026-03-05' }));
      expect(result.periodo).toEqual({ from: '2026-03-05', to: '2026-03-31' });
      expect(result.tasaAhorroPorcentaje).toBeNull();
    });
  });

  describe('desglose_por_categoria', () => {
    it('ordena de mayor a menor y respeta el límite', () => {
      const result = ok(run('desglose_por_categoria', { ...march, tipo: 'egreso', limite: 2 }));
      expect(result.total).toBe(17650);
      expect(result.categorias).toEqual([
        { categoria: 'Vivienda', total: 12000, porcentaje: 68, movimientos: 1 },
        { categoria: 'Alimentación', total: 4500, porcentaje: 25.5, movimientos: 1 },
      ]);
      expect(result.categoriasOmitidas).toBe(1);
    });

    it('devuelve una lista vacía cuando no hay movimientos', () => {
      const result = ok(run('desglose_por_categoria', { desde: '2025-01-01', hasta: '2025-01-31', tipo: 'egreso', limite: 5 }));
      expect(result.categorias).toEqual([]);
      expect(result.categoriasOmitidas).toBe(0);
    });
  });

  describe('serie_mensual', () => {
    it('termina en el mes de hoy por defecto', () => {
      const result = ok(run('serie_mensual', { meses: 2 }));
      expect(result.meses.map((m: any) => [m.mes, m.ingresos, m.egresos])).toEqual([
        ['2026-02', 30000, 15000],
        ['2026-03', 30000, 17650],
      ]);
      expect(result.meses[1].etiqueta).toContain('marzo');
    });

    it('limita la cantidad de meses', () => {
      expect(ok(run('serie_mensual', { meses: 100 })).meses.length).toBe(24);
      expect(ok(run('serie_mensual', {})).meses.length).toBe(6);
    });
  });

  describe('buscar_movimientos', () => {
    it('busca texto sin distinguir mayúsculas ni acentos y suma todas las coincidencias', () => {
      const result = ok(run('buscar_movimientos', { texto: 'uber' }));
      expect(result.coincidencias).toBe(2);
      expect(result.sumaEgresos).toBe(1150);
      expect(result.movimientos.map((m: any) => m.fecha)).toEqual(['2026-03-15', '2026-03-09']);

      expect(ok(run('buscar_movimientos', { texto: 'SUPER' })).coincidencias).toBe(2);
      expect(ok(run('buscar_movimientos', { categoria: 'alimentacion' })).coincidencias).toBe(2);
    });

    it('combina filtros de tipo, fechas y montos', () => {
      const result = ok(
        run('buscar_movimientos', { tipo: 'egreso', desde: '2026-03-01', hasta: '2026-03-31', montoMin: 500, montoMax: 5000 }),
      );
      expect(result.movimientos.map((m: any) => m.monto)).toEqual([800, 4500]);
    });

    it('ordena por monto y marca cuando la lista se recorta', () => {
      const result = ok(run('buscar_movimientos', { tipo: 'egreso', orden: 'mayor_monto', limite: 2 }));
      expect(result.movimientos.map((m: any) => m.monto)).toEqual([12000, 12000]);
      expect(result.movimientos[0].fecha).toBe('2026-03-02');
      expect(result.recortado).toBeTrue();
      expect(result.coincidencias).toBe(6);
    });

    it('no devuelve más del máximo permitido', () => {
      const many = withMovements(Array.from({ length: 80 }, () => mv('egreso', 'Miscelánea', 10, '2026-03-01')));
      expect(ok(run('buscar_movimientos', { limite: 500 }, many)).movimientos.length).toBe(SEARCH_MAX_LIMIT);
    });
  });

  it('obtener_recomendaciones traduce el nivel de cada recomendación', () => {
    const result = ok(run('obtener_recomendaciones', march));
    expect(result.recomendaciones.length).toBeGreaterThan(0);
    for (const r of result.recomendaciones) {
      expect(['alerta', 'advertencia', 'informativo', 'positivo']).toContain(r.nivel);
    }
  });

  it('listar_categorias incluye predefinidas, personalizadas y las usadas por movimientos', () => {
    const appData = withMovements([mv('egreso', 'Mascotas', 200, '2026-03-01')], {
      categories: { ingreso: ['Rentas'], egreso: [] },
    });
    const result = ok(run('listar_categorias', {}, appData));
    expect(result.ingreso).toContain('Salario');
    expect(result.ingreso).toContain('Rentas');
    expect(result.egreso).toContain('Mascotas');
  });

  it('estado_presupuesto reporta tope, gastado y nivel por categoría del mes pedido', () => {
    const appData = withMovements(data.movements, {
      budgets: [
        { category: 'Alimentación', amount: 4000 },
        { category: 'Transporte', amount: 2000 },
      ],
    });
    const result = ok(run('estado_presupuesto', {}, appData));
    expect(result.mes).toBe('2026-03');
    expect(result.presupuestoTotal).toBe(6000);
    expect(result.categorias[0]).toEqual(
      jasmine.objectContaining({ categoria: 'Alimentación', gastado: 4500, disponible: -500, nivel: 'excedido' }),
    );
    expect(result.categorias[1].nivel).toBe('en_rango');
    expect(result.sinPresupuesto).toEqual([{ categoria: 'Vivienda', gastado: 12000 }]);

    const february = ok(run('estado_presupuesto', { fecha: '2026-02-14' }, appData));
    expect(february.mes).toBe('2026-02');
    expect(february.avanceDelMesPorcentaje).toBe(100);
    expect(ok(run('estado_presupuesto', {})).tienePresupuestos).toBeFalse();
  });

  it('pendientes_por_confirmar resume la bandeja', () => {
    const pending: PendingMovement = {
      id: 'p1',
      type: 'egreso',
      amount: 89.5,
      merchant: 'OXXO',
      card: 'Visa',
      date: '2026-03-19',
      receivedAt: '2026-03-19T10:00:00.000Z',
    };
    const result = ok(run('pendientes_por_confirmar', {}, withMovements([], { pending: [pending] })));
    expect(result.total).toBe(1);
    expect(result.pendientes).toEqual([{ fecha: '2026-03-19', tipo: 'egreso', monto: 89.5, comercio: 'OXXO', tarjeta: 'Visa' }]);
  });
});
