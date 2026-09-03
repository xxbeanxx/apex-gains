import { afterEach, describe, expect, it } from "vitest";

import {
  getGoogleClientId,
  getGoogleClientSecret,
  getOrigin,
  getSessionSecret,
  isTestLoginEnabled,
} from "./env.server";

describe("env.server", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("getOrigin", () => {
    it("returns ORIGIN unchanged when it has no trailing slash", () => {
      process.env.ORIGIN = "http://localhost:5173";
      expect(getOrigin()).toBe("http://localhost:5173");
    });

    it("strips one or more trailing slashes", () => {
      process.env.ORIGIN = "https://example.com///";
      expect(getOrigin()).toBe("https://example.com");
    });

    it("throws when ORIGIN is unset", () => {
      delete process.env.ORIGIN;
      expect(() => getOrigin()).toThrow(
        "ORIGIN environment variable is not set",
      );
    });

    it("throws when ORIGIN is an empty string", () => {
      process.env.ORIGIN = "";
      expect(() => getOrigin()).toThrow(
        "ORIGIN environment variable is not set",
      );
    });
  });

  describe("getSessionSecret", () => {
    it("returns the configured secret", () => {
      process.env.SESSION_SECRET = "shh";
      expect(getSessionSecret()).toBe("shh");
    });

    it("throws when unset", () => {
      delete process.env.SESSION_SECRET;
      expect(() => getSessionSecret()).toThrow(
        "SESSION_SECRET environment variable is not set",
      );
    });
  });

  describe("getGoogleClientId / getGoogleClientSecret", () => {
    it("return the configured values", () => {
      process.env.GOOGLE_CLIENT_ID = "client-id";
      process.env.GOOGLE_CLIENT_SECRET = "client-secret";
      expect(getGoogleClientId()).toBe("client-id");
      expect(getGoogleClientSecret()).toBe("client-secret");
    });

    it("throw when unset", () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      expect(() => getGoogleClientId()).toThrow(
        "GOOGLE_CLIENT_ID environment variable is not set",
      );
      expect(() => getGoogleClientSecret()).toThrow(
        "GOOGLE_CLIENT_SECRET environment variable is not set",
      );
    });
  });

  describe("isTestLoginEnabled", () => {
    it("is false when unset", () => {
      delete process.env.ENABLE_TEST_LOGIN;
      expect(isTestLoginEnabled()).toBe(false);
    });

    it("is false for any value other than the exact string 'true'", () => {
      process.env.ENABLE_TEST_LOGIN = "1";
      expect(isTestLoginEnabled()).toBe(false);
    });

    it("is true when set to 'true'", () => {
      process.env.ENABLE_TEST_LOGIN = "true";
      expect(isTestLoginEnabled()).toBe(true);
    });
  });
});
