import { describe, it, expect, vi, afterEach } from "vitest";
import {
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  InternalServerError,
  BadRequestError,
} from "openai";
import { classifyError, withRetries } from "./retry.js";

describe("classifyError", () => {
  it("should classify 429 as transient", () => {
    expect(classifyError(new RateLimitError(429, {}, "rate limited", new Headers()))).toBe("transient");
  });

  it("should classify 5xx as transient", () => {
    expect(classifyError(new InternalServerError(500, {}, "boom", new Headers()))).toBe("transient");
    expect(classifyError(new InternalServerError(503, {}, "unavailable", new Headers()))).toBe("transient");
  });

  it("should classify connection errors as transient", () => {
    expect(classifyError(new APIConnectionError({ message: "connection failed" }))).toBe("transient");
    expect(classifyError(new APIConnectionTimeoutError({ message: "timed out" }))).toBe("transient");
  });

  it("should classify network error messages as transient", () => {
    expect(classifyError(new Error("connect ECONNRESET 1.2.3.4"))).toBe("transient");
    expect(classifyError(new Error("request timed out ETIMEDOUT"))).toBe("transient");
    expect(classifyError(new Error("getaddrinfo ENOTFOUND api.example.com"))).toBe("transient");
  });

  it("should classify 401 and 403 as fatal", () => {
    expect(classifyError(new AuthenticationError(401, {}, "unauthorized", new Headers()))).toBe("fatal");
    expect(classifyError(new PermissionDeniedError(403, {}, "forbidden", new Headers()))).toBe("fatal");
  });

  it("should classify context-length errors as fatal", () => {
    const err = new BadRequestError(
      400,
      { message: "This model's maximum context length is 4096 tokens" },
      "context length exceeded",
      new Headers()
    );
    expect(classifyError(err)).toBe("fatal");
  });

  it("should classify context-length errors as fatal even when reported with a 5xx status", () => {
    const err = new InternalServerError(
      500,
      { message: "maximum context length exceeded" },
      "maximum context length exceeded",
      new Headers()
    );
    expect(classifyError(err)).toBe("fatal");
  });

  it("should classify other API errors as fatal", () => {
    expect(classifyError(new BadRequestError(400, {}, "bad request", new Headers()))).toBe("fatal");
    expect(classifyError(new APIError(404, {}, "not found", new Headers()))).toBe("fatal");
  });

  it("should classify unknown errors as fatal", () => {
    expect(classifyError(new Error("something else"))).toBe("fatal");
    expect(classifyError("not an error")).toBe("fatal");
  });
});

describe("withRetries", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should succeed immediately when no error occurs", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetries(fn, { maxRetries: 3, baseMs: 1000, jitterMs: 0 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry transient errors with exponential backoff then succeed", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError(429, {}, "slow down", new Headers()))
      .mockRejectedValueOnce(new RateLimitError(429, {}, "slow down", new Headers()))
      .mockResolvedValue("ok");

    const onRetry = vi.fn();
    const promise = withRetries(fn, { maxRetries: 3, baseMs: 1000, jitterMs: 0 }, onRetry);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][1]).toBe(1000);
    expect(onRetry.mock.calls[1][1]).toBe(2000);
  });

  it("should throw the last error when all retries are exhausted", async () => {
    vi.useFakeTimers();
    const lastError = new InternalServerError(500, {}, "boom", new Headers());
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new InternalServerError(500, {}, "boom", new Headers()))
      .mockRejectedValueOnce(new InternalServerError(500, {}, "boom", new Headers()))
      .mockRejectedValueOnce(new InternalServerError(500, {}, "boom", new Headers()))
      .mockRejectedValueOnce(lastError);

    const onRetry = vi.fn();
    const promise = withRetries(fn, { maxRetries: 3, baseMs: 1000, jitterMs: 0 }, onRetry);
    const assertion = expect(promise).rejects.toBe(lastError);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);

    await assertion;
    expect(fn).toHaveBeenCalledTimes(4);
    expect(onRetry).toHaveBeenCalledTimes(3);
  });

  it("should not retry fatal errors", async () => {
    vi.useFakeTimers();
    const fatal = new AuthenticationError(401, {}, "unauthorized", new Headers());
    const fn = vi.fn().mockRejectedValue(fatal);

    const onRetry = vi.fn();
    const promise = withRetries(fn, { maxRetries: 3, baseMs: 1000, jitterMs: 0 }, onRetry);

    await expect(promise).rejects.toBe(fatal);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
