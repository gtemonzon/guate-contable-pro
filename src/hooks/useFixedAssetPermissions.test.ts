/**
 * Permisos de activos fijos (lógica pura del hook).
 * Run with: bunx vitest run src/hooks/useFixedAssetPermissions.test.ts
 */
import { describe, it, expect, vi } from "vitest";

// La lógica pura no consulta la base; se evita crear el cliente real.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: () => undefined } }));

import { resolveFixedAssetPermissions } from "./useFixedAssetPermissions";

describe("resolveFixedAssetPermissions", () => {
  it("ambos permisos", () => {
    expect(resolveFixedAssetPermissions({ writeData: true, valuationData: true, loading: false }))
      .toEqual({ canWrite: true, canManageValuation: true, isLoading: false });
  });
  it("solo operar", () => {
    expect(resolveFixedAssetPermissions({ writeData: true, valuationData: false, loading: false }))
      .toEqual({ canWrite: true, canManageValuation: false, isLoading: false });
  });
  it("solo valoración", () => {
    expect(resolveFixedAssetPermissions({ writeData: false, valuationData: true, loading: false }))
      .toEqual({ canWrite: false, canManageValuation: true, isLoading: false });
  });
  it("respuestas nulas o ausentes => sin permisos", () => {
    expect(resolveFixedAssetPermissions({ writeData: null, valuationData: undefined, loading: false }))
      .toEqual({ canWrite: false, canManageValuation: false, isLoading: false });
  });
  it("cargando => sin permisos y isLoading", () => {
    expect(resolveFixedAssetPermissions({ writeData: true, valuationData: true, loading: true }))
      .toEqual({ canWrite: false, canManageValuation: false, isLoading: true });
  });
});
