import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ensureSchemaWithRetries, createPool } from "./db.js";

describe("ensureSchemaWithRetries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should succeed when the schema is created on the first attempt", async () => {
    const schemaFn = vi.fn().mockResolvedValue(undefined);
    await ensureSchemaWithRetries(3, 1000, schemaFn);
    expect(schemaFn).toHaveBeenCalledTimes(1);
  });

  it("should succeed after transient failures", async () => {
    const schemaFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const promise = ensureSchemaWithRetries(3, 1000, schemaFn);
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    expect(schemaFn).toHaveBeenCalledTimes(2);
  });

  it("should retry then exit with code 1 when the database stays unreachable", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as () => never);
    const schemaFn = vi.fn().mockRejectedValue(new Error("connection refused"));

    const promise = ensureSchemaWithRetries(3, 1000, schemaFn);
    await vi.advanceTimersByTimeAsync(3000);
    await promise;

    expect(schemaFn).toHaveBeenCalledTimes(3);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("createPool", () => {
  it("should apply a bounded connection timeout", async () => {
    const pool = createPool("postgres://u:p@localhost:5432/nonexistent");
    expect(pool.options.connectionTimeoutMillis).toBe(5000);
    await pool.end();
  });

  it("should log idle-client errors instead of crashing the process", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = createPool("postgres://u:p@localhost:5432/nonexistent");

    expect(() => pool.emit("error", new Error("idle client boom"))).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      "Unexpected error on idle postgres client:",
      "idle client boom"
    );

    errorSpy.mockRestore();
    await pool.end();
  });
});
