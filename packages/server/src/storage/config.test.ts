import { describe, it, expect, afterEach, vi } from "vitest";
import { parseStorageConfig, storageConfig } from "./config.js";

describe("parseStorageConfig", () => {
  it("should disable persistence when DATABASE_URL is unset", () => {
    const config = parseStorageConfig({});
    expect(config.enabled).toBe(false);
    expect(config.databaseUrl).toBe("");
  });

  it("should disable persistence when DATABASE_URL is empty", () => {
    const config = parseStorageConfig({ DATABASE_URL: "" });
    expect(config.enabled).toBe(false);
  });

  it("should disable persistence when DATABASE_URL is whitespace-only", () => {
    const config = parseStorageConfig({ DATABASE_URL: "   " });
    expect(config.enabled).toBe(false);
  });

  it("should enable persistence when DATABASE_URL is set", () => {
    const config = parseStorageConfig({ DATABASE_URL: "postgres://user:pass@host:5432/db" });
    expect(config.enabled).toBe(true);
    expect(config.databaseUrl).toBe("postgres://user:pass@host:5432/db");
  });
});

describe("storageConfig singleton", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should read DATABASE_URL from process.env", () => {
    vi.stubEnv("DATABASE_URL", "postgres://u:p@h:5432/db");
    expect(storageConfig.enabled).toBe(true);
    expect(storageConfig.databaseUrl).toBe("postgres://u:p@h:5432/db");
  });

  it("should be disabled when DATABASE_URL is not set", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(storageConfig.enabled).toBe(false);
  });
});
