import { describe, expect, it } from "vitest";

import { commitSession, destroySession, getSession } from "./session.server";

describe("session.server", () => {
  it("starts with no userId for a fresh session", async () => {
    const session = await getSession(null);
    expect(session.get("userId")).toBeUndefined();
  });

  it("round-trips a userId through commit and re-parse", async () => {
    const session = await getSession(null);
    session.set("userId", "user-1");

    const cookieHeader = await commitSession(session);
    const restored = await getSession(cookieHeader);

    expect(restored.get("userId")).toBe("user-1");
  });

  it("does not read a userId from an unsigned or unrelated cookie", async () => {
    const session = await getSession("__session=not-a-valid-signed-value");
    expect(session.get("userId")).toBeUndefined();
  });

  it("clears the cookie on destroy", async () => {
    const session = await getSession(null);
    session.set("userId", "user-1");
    const committed = await commitSession(session);
    const restored = await getSession(committed);

    const destroyed = await destroySession(restored);
    expect(destroyed).toMatch(/^__session=;/);

    const afterDestroy = await getSession(destroyed);
    expect(afterDestroy.get("userId")).toBeUndefined();
  });
});
