import { APIError, APIConnectionError, APIConnectionTimeoutError } from "openai";

export type ErrorClass = "transient" | "fatal";

const NETWORK_ERROR_PATTERN = /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|socket hang up/i;
const CONTEXT_LENGTH_PATTERN = /context length|context_length|maximum context/i;

export function classifyError(err: unknown): ErrorClass {
  if (err instanceof APIConnectionError || err instanceof APIConnectionTimeoutError) {
    return "transient";
  }
  if (err instanceof APIError) {
    if (isContextLengthError(err)) {
      return "fatal";
    }
    const status = err.status;
    if (status === 429 || (status !== undefined && status >= 500)) {
      return "transient";
    }
    if (status === 401 || status === 403) {
      return "fatal";
    }
    return "fatal";
  }
  const message = err instanceof Error ? err.message : String(err);
  if (NETWORK_ERROR_PATTERN.test(message)) {
    return "transient";
  }
  return "fatal";
}

function isContextLengthError(err: APIError): boolean {
  const message = err.message ?? "";
  const body = err.error;
  const bodyMessage =
    body && typeof body === "object" && "message" in body
      ? String((body as { message: unknown }).message ?? "")
      : "";
  return CONTEXT_LENGTH_PATTERN.test(message) || CONTEXT_LENGTH_PATTERN.test(bodyMessage);
}

export interface RetryOptions {
  maxRetries: number;
  baseMs: number;
  jitterMs?: number;
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void
): Promise<T> {
  const jitterMs = options.jitterMs ?? options.baseMs;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (classifyError(err) === "fatal") {
        throw err;
      }
      if (attempt >= options.maxRetries) {
        throw err;
      }
      attempt++;
      const delay = options.baseMs * Math.pow(2, attempt - 1) + Math.random() * jitterMs;
      onRetry?.(attempt, delay, err);
      await sleep(delay);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
