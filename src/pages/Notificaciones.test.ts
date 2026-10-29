import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// La página de notificaciones debe tomar la empresa del contexto (la misma fuente
// que la campana), nunca de localStorage: la clave 'currentEnterpriseId' se escribe
// de forma asíncrona y al abrir la página directo se leía vacía o desactualizada,
// mostrando "0 de 0" mientras la campana sí mostraba sus avisos.
const source = readFileSync(resolve(__dirname, 'Notificaciones.tsx'), 'utf8');

describe('fuente de la empresa en /notificaciones', () => {
  it('no lee la empresa desde localStorage', () => {
    expect(source).not.toMatch(/localStorage\.getItem\(\s*['"]currentEnterpriseId['"]\s*\)/);
  });

  it('usa el contexto de empresas', () => {
    expect(source).toMatch(/from ['"]@\/contexts\/EnterpriseContext['"]/);
    expect(source).toMatch(/useEnterprise\(\)/);
    expect(source).toMatch(/selectedEnterpriseId/);
  });

  it('pasa la empresa del contexto a la consulta de avisos y al generador', () => {
    expect(source).toMatch(/useNotifications\(\s*selectedEnterpriseId\s*\)/);
    expect(source).toMatch(/generateAlerts\(\s*selectedEnterpriseId\s*\)/);
    expect(source).toMatch(/enterpriseId=\{selectedEnterpriseId\}/);
  });
});
