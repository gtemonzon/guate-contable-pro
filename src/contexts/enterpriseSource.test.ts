import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Prueba de guardia: estas pantallas deben tomar la empresa activa del contexto
// (EnterpriseContext, fuente única), nunca de localStorage. La clave
// 'currentEnterpriseId' es solo una pista que el contexto escribe de forma asíncrona:
// al abrir una pantalla directo (marcador, recarga, sesión nueva) se leía vacía o
// desactualizada, y el evento "storage" no avisa de cambios en la misma pestaña.
const SRC = resolve(__dirname, '..');

const PROTECTED_FILES = [
  'pages/Notificaciones.tsx',
  'pages/Cuentas.tsx',
  'pages/GenerarDeclaracion.tsx',
  'pages/ConciliacionBancaria.tsx',
  'components/empresas/EnterprisesTable.tsx',
];

const read = (file: string) => readFileSync(resolve(SRC, file), 'utf8');

describe('la empresa activa sale del contexto', () => {
  it.each(PROTECTED_FILES)('%s no lee la empresa desde localStorage ni escucha "storage"', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/localStorage\.getItem\(\s*['"]currentEnterpriseId['"]\s*\)/);
    expect(source).not.toMatch(/addEventListener\(\s*['"]storage['"]/);
  });

  it.each(PROTECTED_FILES)('%s usa el contexto de empresas', (file) => {
    const source = read(file);
    expect(source).toMatch(/from ['"]@\/contexts\/EnterpriseContext['"]/);
    expect(source).toMatch(/useEnterprise\(\)/);
    expect(source).toMatch(/selectedEnterpriseId/);
  });

  it('/notificaciones pasa la empresa del contexto a la consulta de avisos y al generador', () => {
    const source = read('pages/Notificaciones.tsx');
    expect(source).toMatch(/useNotifications\(\s*selectedEnterpriseId\s*\)/);
    expect(source).toMatch(/generateAlerts\(\s*selectedEnterpriseId\s*\)/);
    expect(source).toMatch(/enterpriseId=\{selectedEnterpriseId\}/);
  });
});
