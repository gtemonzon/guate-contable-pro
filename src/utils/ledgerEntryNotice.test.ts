import { describe, it, expect } from "vitest";
import { ledgerEntryNotice } from "./ledgerEntryNotice";

const msg = (l: string) => `Esta partida está ${l}: el mayor solo incluye partidas contabilizadas, por eso sus líneas no aparecen aquí.`;

describe("ledgerEntryNotice", () => {
  it("sin aviso para contabilizado o vacío", () => {
    expect(ledgerEntryNotice("contabilizado")).toBeNull();
    expect(ledgerEntryNotice("")).toBeNull();
    expect(ledgerEntryNotice(null)).toBeNull();
    expect(ledgerEntryNotice(undefined)).toBeNull();
  });
  it("borrador", () => expect(ledgerEntryNotice("borrador")).toBe(msg("en borrador")));
  it("pendiente de revisión", () => expect(ledgerEntryNotice("pendiente_revision")).toBe(msg("pendiente de revisión")));
  it("aprobado", () => expect(ledgerEntryNotice("aprobado")).toBe(msg("aprobada pero no contabilizada")));
  it("rechazado", () => expect(ledgerEntryNotice("rechazado")).toBe(msg("rechazada")));
  it("desconocido", () => expect(ledgerEntryNotice("otro")).toBe(msg("no contabilizada")));
});

describe("ledgerEntryNotice (libro de bancos)", () => {
  const bancos = (l: string) =>
    `Esta partida está ${l}: el libro de bancos solo suma partidas contabilizadas, por eso sus montos no aparecen aquí.`;

  it("sin aviso para contabilizado", () => expect(ledgerEntryNotice("contabilizado", "bancos")).toBeNull());
  it("borrador", () => expect(ledgerEntryNotice("borrador", "bancos")).toBe(bancos("en borrador")));
  it("pendiente de revisión", () => expect(ledgerEntryNotice("pendiente_revision", "bancos")).toBe(bancos("pendiente de revisión")));
  it("aprobado", () => expect(ledgerEntryNotice("aprobado", "bancos")).toBe(bancos("aprobada pero no contabilizada")));
  it("rechazado", () => expect(ledgerEntryNotice("rechazado", "bancos")).toBe(bancos("rechazada")));
  it("desconocido", () => expect(ledgerEntryNotice("otro", "bancos")).toBe(bancos("no contabilizada")));
});
