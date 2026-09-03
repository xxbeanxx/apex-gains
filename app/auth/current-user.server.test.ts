import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Athlete } from "~/domain/athlete/athlete";
import type { AthletesRepository } from "~/repositories/athletes-repository";
import { mock } from "~/test/mock";

const { findByIdMock, getSessionMock } = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock("~/repositories/athletes-repository.server", () => ({
  getAthletesRepository: vi
    .fn()
    .mockResolvedValue(
      mock<AthletesRepository>({ findById: findByIdMock }),
    ),
}));

vi.mock("./session.server", () => ({
  getSession: getSessionMock,
}));

const { loadUserMiddleware } = await import("./current-user.server");
const { userContext } = await import("./user-context");

type MiddlewareArgs = Parameters<typeof loadUserMiddleware>[0];

function sessionWithUserId(userId: string | undefined) {
  return { get: (name: string) => (name === "userId" ? userId : undefined) };
}

function argsWithContext(): {
  args: MiddlewareArgs;
  context: RouterContextProvider;
} {
  const context = new RouterContextProvider();
  const args = mock<MiddlewareArgs>({
    request: new Request("http://localhost/today", {
      headers: { Cookie: "__session=abc" },
    }),
    context,
  });
  return { args, context };
}

const noopNext = async () => undefined;

describe("loadUserMiddleware", () => {
  beforeEach(() => {
    findByIdMock.mockReset();
    getSessionMock.mockReset();
  });

  it("does not set a user when the session has no userId", async () => {
    getSessionMock.mockResolvedValue(sessionWithUserId(undefined));
    const { args, context } = argsWithContext();

    await loadUserMiddleware(args, noopNext);

    expect(context.get(userContext)).toBeNull();
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("sets the athlete in context when the session's userId resolves to a row", async () => {
    getSessionMock.mockResolvedValue(sessionWithUserId("user-1"));
    const user = mock<Athlete>({ id: "user-1", email: "greg@example.com" });
    findByIdMock.mockResolvedValue(user);
    const { args, context } = argsWithContext();

    await loadUserMiddleware(args, noopNext);

    expect(findByIdMock).toHaveBeenCalledWith("user-1");
    expect(context.get(userContext)).toBe(user);
  });

  it("does not set a user when the session's userId has no matching row", async () => {
    getSessionMock.mockResolvedValue(sessionWithUserId("stale-user"));
    findByIdMock.mockResolvedValue(null);
    const { args, context } = argsWithContext();

    await loadUserMiddleware(args, noopNext);

    expect(context.get(userContext)).toBeNull();
  });
});
