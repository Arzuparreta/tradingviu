export class TvError extends Error {
  override readonly name: string;
  readonly code: string;
  readonly status: number;
  readonly meta?: Record<string, unknown>;

  constructor(opts: {
    name: string;
    code: string;
    status: number;
    message: string;
    meta?: Record<string, unknown> | undefined;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = opts.name;
    this.code = opts.code;
    this.status = opts.status;
    if (opts.meta !== undefined) this.meta = opts.meta;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

export class NotFoundError extends TvError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super({ name: 'NotFoundError', code: 'NOT_FOUND', status: 404, message, meta });
  }
}

export class ValidationError extends TvError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super({ name: 'ValidationError', code: 'VALIDATION', status: 422, message, meta });
  }
}

export class AuthError extends TvError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super({ name: 'AuthError', code: 'UNAUTHENTICATED', status: 401, message, meta });
  }
}

export class ForbiddenError extends TvError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super({ name: 'ForbiddenError', code: 'FORBIDDEN', status: 403, message, meta });
  }
}

export class QuotaExceededError extends TvError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super({ name: 'QuotaExceededError', code: 'QUOTA_EXCEEDED', status: 402, message, meta });
  }
}

export class ConflictError extends TvError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super({ name: 'ConflictError', code: 'CONFLICT', status: 409, message, meta });
  }
}

export class RateLimitError extends TvError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super({ name: 'RateLimitError', code: 'RATE_LIMIT', status: 429, message, meta });
  }
}

export class UpstreamError extends TvError {
  constructor(message: string, meta?: Record<string, unknown>, cause?: unknown) {
    super({ name: 'UpstreamError', code: 'UPSTREAM', status: 502, message, meta, cause });
  }
}

export const isTvError = (e: unknown): e is TvError => e instanceof TvError;
