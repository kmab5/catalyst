import type { ErrorCode } from './contract';

export class ApiError extends Error {
  constructor(
    public code: ErrorCode | 'SERVER_GONE',
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
