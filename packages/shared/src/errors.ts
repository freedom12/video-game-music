export class AppError extends Error {
  /** Marker to identify AppError instances across module boundaries */
  readonly __appError = true as const;

  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static is(error: unknown): error is AppError {
    return (
      error instanceof AppError
      || (error != null && typeof error === 'object' && '__appError' in error && (error as any).__appError === true)
    );
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      'NOT_FOUND',
      id ? `${resource} '${id}' not found` : `${resource} not found`,
    );
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class StorageError extends AppError {
  constructor(message: string, details?: unknown) {
    super('STORAGE_ERROR', message, details);
    this.name = 'StorageError';
  }
}
