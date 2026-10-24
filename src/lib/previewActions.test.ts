import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadPreviewFile, openPreviewFile } from "./previewActions";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("private preview actions", () => {
  it("reauthorizes each new-tab action even after the original 60-second URL expires", async () => {
    vi.useFakeTimers();
    const replace = vi.fn();
    const tab = { opener: {}, location: { replace }, close: vi.fn() };
    vi.stubGlobal("window", { open: vi.fn(() => tab) });
    const resolveUrl = vi.fn().mockResolvedValueOnce("fresh-1").mockResolvedValueOnce("fresh-2");
    const request = { url: "expired", fileName: "documento.pdf", resolveUrl };
    await vi.advanceTimersByTimeAsync(61_000);
    await openPreviewFile(request);
    await vi.advanceTimersByTimeAsync(61_000);
    await openPreviewFile(request);
    expect(resolveUrl).toHaveBeenCalledTimes(2);
    expect(replace.mock.calls).toEqual([["fresh-1"], ["fresh-2"]]);
    expect(tab.opener).toBeNull();
  });

  it("downloads a freshly authorized file as a local blob instead of navigating to storage", async () => {
    vi.useFakeTimers();
    const blob = new Blob(["PDF"]);
    const fetchFile = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetchFile);
    const link = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("document", { createElement: () => link, body: { appendChild: vi.fn() } });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const resolveUrl = vi.fn().mockResolvedValue("fresh");
    await vi.advanceTimersByTimeAsync(61_000);
    await downloadPreviewFile({ url: "expired", fileName: "documento.pdf", resolveUrl });
    expect(fetchFile).toHaveBeenCalledWith("fresh");
    expect(link.href).toBe("blob:local");
    expect(link.download).toBe("documento.pdf");
    expect(link.click).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalledWith("blob:local");
  });

  it("closes the reserved tab when access renewal is denied", async () => {
    const tab = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
    vi.stubGlobal("window", { open: () => tab });
    await expect(openPreviewFile({ url: "expired", fileName: "test.pdf", resolveUrl: async () => { throw new Error("Sin acceso"); } })).rejects.toThrow("Sin acceso");
    expect(tab.close).toHaveBeenCalledOnce();
    expect(tab.location.replace).not.toHaveBeenCalled();
  });

  it("preserves generated blob preview support", async () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { open: () => ({ opener: null, location: { replace }, close: vi.fn() }) });
    await openPreviewFile({ url: "blob:generated", fileName: "reporte.pdf" });
    expect(replace).toHaveBeenCalledWith("blob:generated");
  });
});