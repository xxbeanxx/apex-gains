import { describe, expect, it } from "vitest";

import { safeRedirect } from "./safe-redirect.server";

describe("safeRedirect", () => {
  it("keeps an in-app absolute path", () => {
    expect(safeRedirect("/routines/abc?edit=1")).toBe("/routines/abc?edit=1");
  });

  it("falls back when nothing was requested", () => {
    expect(safeRedirect(null)).toBe("/today");
    expect(safeRedirect(undefined)).toBe("/today");
    expect(safeRedirect("")).toBe("/today");
  });

  it("rejects an absolute URL to another origin", () => {
    expect(safeRedirect("https://evil.example/steal")).toBe("/today");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeRedirect("//evil.example/steal")).toBe("/today");
  });

  it("rejects the backslash spelling of a protocol-relative URL", () => {
    expect(safeRedirect("/\\evil.example/steal")).toBe("/today");
  });

  it("rejects a path-less scheme", () => {
    expect(safeRedirect("javascript:alert(1)")).toBe("/today");
  });

  it("honours an explicit fallback", () => {
    expect(safeRedirect("https://evil.example", "/routines")).toBe("/routines");
  });
});
