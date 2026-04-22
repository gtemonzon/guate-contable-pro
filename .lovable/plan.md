
# Implementación: Nivel 1 — Detección y feedback de conexión

## Qué se construye

Sistema de detección de pérdida de internet con feedback visual claro al usuario y reintentos automáticos, sin alterar el comportamiento de los datos ni la integridad contable.

## Cambios

### Archivos nuevos

1. **`src/hooks/useOnlineStatus.ts`**
   - Escucha eventos `online` / `offline` del navegador.
   - Ping periódico ligero a Supabase cada 30s (`tab_currencies` con `select('id').limit(1)`) para detectar "wifi conectado pero sin internet real".
   - Devuelve `{ isOnline: boolean, lastChecked: Date }`.

2. **`src/components/layout/OfflineBanner.tsx`**
   - Banner sticky en la parte superior cuando `isOnline === false`.
   - Estilo de advertencia (fondo ámbar/rojo suave, ícono `WifiOff`).
   - Texto: "Sin conexión a internet. Tus cambios no se guardarán hasta que se restablezca la conexión."
   - Toast con `sonner` cuando la conexión se restablece: "Conexión restablecida".
   - Toast cuando se pierde: "Sin conexión a internet".

3. **`src/utils/networkErrors.ts`**
   - `isNetworkError(err)`: detecta `Failed to fetch`, `NetworkError`, `TypeError: Load failed`, etc.
   - `formatNetworkError(err, fallback)`: devuelve mensaje amigable "Sin conexión a internet. Intenta de nuevo en unos momentos." si es error de red, sino el mensaje original.

### Archivos modificados

4. **`src/App.tsx`**
   - Configurar `QueryClient` con reintentos exponenciales:
     ```ts
     defaultOptions: {
       queries: {
         retry: (failureCount, error) => {
           if (failureCount >= 3) return false;
           return isNetworkError(error);
         },
         retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
       },
       mutations: {
         retry: (failureCount, error) => failureCount < 2 && isNetworkError(error),
         retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
       },
     }
     ```

5. **`src/components/layout/MainLayout.tsx`**
   - Montar `<OfflineBanner />` en la parte superior del layout (fuera de scroll, sticky top).

6. **`src/utils/errorMessages.ts`**
   - Integrar `formatNetworkError` en el helper central de mensajes para que todos los toasts de error de operaciones fallidas muestren mensaje claro cuando es problema de red.

7. **`src/pages/Ayuda.tsx`**
   - Nueva subsección dentro de "Novedades Recientes": **"Trabajo sin conexión"**.
   - Explica el banner, los toasts, los reintentos automáticos, y advierte que actualmente los formularios en edición sí pueden perder datos si se pierde conexión durante el guardado (anticipo del Nivel 2 futuro).

## Detalles técnicos

- **Sin cambios en BD ni edge functions.** Implementación 100% client-side.
- **Ping endpoint**: se usa `tab_currencies` por ser tabla pública, ligera y siempre presente. Se ignoran errores de RLS (solo nos importa si responde la red).
- **Anti-flicker**: el estado `isOnline` solo cambia tras 2 intentos fallidos consecutivos del ping para evitar parpadeos por latencia momentánea.
- **Pausar pings cuando la pestaña está oculta** (`document.hidden`) para ahorrar recursos.
- **React Query**: solo reintenta errores de red (no errores de validación, RLS o lógica de negocio, que se mostrarían igualmente al usuario).
- **Compatibilidad**: el hook se monta una sola vez en `MainLayout`, así no se duplican listeners ni pings.

## Lo que NO incluye este nivel

- No guarda borradores locales de formularios (eso es Nivel 2).
- No cachea consultas para uso offline (eso es Nivel 3).
- No bloquea botones de "Guardar" cuando offline — solo avisa; el intento de guardado fallará con mensaje claro y se reintentará automáticamente.
