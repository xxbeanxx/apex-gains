import { createCookieSessionStorage } from "react-router";

import { getSessionSecret } from "./env.server";

type SessionData = {
  userId: string;
};

const { getSession, commitSession, destroySession } =
  createCookieSessionStorage<SessionData>({
    cookie: {
      name: "__session",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secrets: [getSessionSecret()],
    },
  });

export { getSession, commitSession, destroySession };
