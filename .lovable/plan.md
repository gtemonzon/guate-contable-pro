
# Plan: Wizard de Configuracion Basica de Empresas

## Resumen
Crear un asistente visual (wizard) que guie al usuario a traves de los pasos esenciales para configurar correctamente una empresa en el sistema. El wizard mostrara el progreso de configuracion con indicadores visuales (checks) y enlaces directos a cada seccion de configuracion.

## Estructura del Wizard

### Pasos del Wizard
1. **Crear Empresa** - Datos basicos de la empresa (NIT, razon social, regimen fiscal)
2. **Periodo Contable** - Al menos un periodo creado y activo
3. **Catalogo de Cuentas** - Cuentas contables cargadas
4. **Cuentas Especiales** - Configuracion de cuentas de IVA, clientes, proveedores, etc.
5. **Estados Financieros** - Formato de Balance General y Estado de Resultados

### Logica de Verificacion por Paso
| Paso | Condicion de Completado |
|------|------------------------|
| Empresa | Siempre completado si existe la empresa |
| Periodo | Existe al menos un periodo con status 'abierto' |
| Catalogo | Existe al menos una cuenta en tab_accounts |
| Cuentas Especiales | tab_enterprise_config tiene al menos vat_credit_account_id y vat_debit_account_id configurados |
| Estados Financieros | Existe al menos un registro en tab_financial_statement_formats |

## Diseno de la Interfaz

### Ubicacion del Boton
- En la tabla de empresas: Agregar icono de engranaje (Settings) entre el boton Editar y Eliminar
- En las tarjetas de empresas: Agregar icono de engranaje junto al boton Editar

### Modal del Wizard
```text
+----------------------------------------------------------+
|  Asistente de Configuracion - [Nombre Empresa]      [X]  |
+----------------------------------------------------------+
|                                                          |
|  [ ] 1. Crear Empresa                              -->   |
|       Datos basicos de la empresa                        |
|                                                          |
|  [ ] 2. Periodo Contable                           -->   |
|       Crear y activar un periodo contable                |
|                                                          |
|  [ ] 3. Catalogo de Cuentas                        -->   |
|       Cargar o importar cuentas contables                |
|                                                          |
|  [ ] 4. Cuentas Especiales                         -->   |
|       Configurar cuentas de IVA, clientes, etc.          |
|                                                          |
|  [ ] 5. Estados Financieros                        -->   |
|       Disenar formato de reportes                        |
|                                                          |
+----------------------------------------------------------+
|  Progreso: 2/5 pasos completados                         |
+----------------------------------------------------------+
```

### Estados Visuales
- **Completado**: Icono Check verde, texto normal
- **Pendiente**: Circulo vacio gris, texto atenuado
- **Actual/Siguiente**: Resaltado como accion recomendada

## Navegacion y Enlaces

| Paso | Destino al hacer clic |
|------|----------------------|
| Empresa | Abrir EnterpriseDialog en tab "General" |
| Periodo | Abrir EnterpriseDialog en tab "Periodos" |
| Catalogo | Navegar a /cuentas |
| Cuentas Especiales | Navegar a /configuracion?tab=enterprise-accounts |
| Estados Financieros | Navegar a /configuracion?tab=financial-statements |

## Archivos a Crear/Modificar

### Nuevos Archivos
1. **src/components/empresas/EnterpriseSetupWizard.tsx** - Componente principal del wizard

### Archivos a Modificar
1. **src/components/empresas/EnterprisesTable.tsx** - Agregar boton de engranaje
2. **src/components/empresas/EnterpriseCard.tsx** - Agregar boton de engranaje
3. **src/pages/Empresas.tsx** - Manejar estado del wizard y dialogo
4. **src/pages/Configuracion.tsx** - Soporte para parametro de tab en URL

---

## Detalles Tecnicos

### Hook para Verificacion de Pasos
Se creara un hook personalizado `useEnterpriseSetupStatus` que verificara el estado de cada paso:

```typescript
interface SetupStep {
  id: string;
  label: string;
  description: string;
  isCompleted: boolean;
  route?: string;
  dialogTab?: string;
}

function useEnterpriseSetupStatus(enterpriseId: number) {
  // Consultas paralelas a la base de datos
  // Retorna array de SetupStep con estado actual
}
```

### Consultas de Verificacion
```sql
-- Verificar periodo activo
SELECT COUNT(*) FROM tab_accounting_periods 
WHERE enterprise_id = ? AND status = 'abierto'

-- Verificar catalogo de cuentas
SELECT COUNT(*) FROM tab_accounts 
WHERE enterprise_id = ?

-- Verificar cuentas especiales
SELECT vat_credit_account_id, vat_debit_account_id 
FROM tab_enterprise_config 
WHERE enterprise_id = ?

-- Verificar estados financieros
SELECT COUNT(*) FROM tab_financial_statement_formats 
WHERE enterprise_id = ?
```

### Estructura del Componente Wizard
```typescript
interface EnterpriseSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterprise: Enterprise;
  onNavigate: (path: string) => void;
  onOpenEnterpriseDialog: (tab: string) => void;
}
```

### Flujo de Navegacion
1. Usuario hace clic en paso
2. Si el paso requiere dialogo (Empresa, Periodo): cerrar wizard, abrir EnterpriseDialog con tab especifica
3. Si el paso requiere navegacion (Catalogo, Configuracion): cerrar wizard, navegar a ruta

### Persistencia de Tab en Configuracion
Modificar Configuracion.tsx para leer parametro `tab` de la URL:
```typescript
const [searchParams] = useSearchParams();
const defaultTab = searchParams.get('tab') || 'enterprise-accounts';
```

### Indicador Visual de Progreso
- Barra de progreso mostrando X/5 pasos completados
- Colores: verde para completados, gris para pendientes

