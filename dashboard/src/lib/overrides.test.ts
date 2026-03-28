import { describe, it, expect } from "vitest";
import { addOverride, lookupOverride } from "./overrides";
import type { CategoryOverrides } from "./overrides";

describe("addOverride", () => {
  it("adds a new merchant→category mapping normalized to uppercase", () => {
    const overrides: CategoryOverrides = {};
    const result = addOverride(overrides, "Mercado Extra-1005", "Supermercado");
    expect(result).toEqual({ "MERCADO EXTRA-1005": "Supermercado" });
  });

  it("does not mutate the original overrides map", () => {
    const original: CategoryOverrides = { "IFOOD": "Delivery" };
    const result = addOverride(original, "SHELL", "Combustivel");
    expect(original).not.toHaveProperty("SHELL");
    expect(result).toHaveProperty("SHELL");
  });

  it("overwrites an existing override for the same merchant", () => {
    const overrides: CategoryOverrides = { "UBER": "Transporte" };
    const result = addOverride(overrides, "UBER", "Delivery");
    expect(result["UBER"]).toBe("Delivery");
  });

  it("preserves existing entries when adding a new one", () => {
    const overrides: CategoryOverrides = { "NETFLIX": "Assinatura" };
    const result = addOverride(overrides, "SPOTIFY", "Assinatura");
    expect(result).toHaveProperty("NETFLIX");
    expect(result).toHaveProperty("SPOTIFY");
  });
});

describe("lookupOverride", () => {
  it("returns the category for an exact uppercase match", () => {
    const overrides: CategoryOverrides = { "SHELL": "Combustivel" };
    expect(lookupOverride(overrides, "SHELL")).toBe("Combustivel");
  });

  it("matches case-insensitively (lowercase input)", () => {
    const overrides: CategoryOverrides = { "IFOOD": "Delivery" };
    expect(lookupOverride(overrides, "ifood")).toBe("Delivery");
  });

  it("matches case-insensitively (mixed case input)", () => {
    const overrides: CategoryOverrides = { "MERCADO EXTRA-1005": "Supermercado" };
    expect(lookupOverride(overrides, "Mercado Extra-1005")).toBe("Supermercado");
  });

  it("returns null when no override exists for the merchant", () => {
    const overrides: CategoryOverrides = { "NETFLIX": "Assinatura" };
    expect(lookupOverride(overrides, "Unknown Merchant")).toBeNull();
  });

  it("returns null for an empty overrides map", () => {
    expect(lookupOverride({}, "UBER")).toBeNull();
  });
});
