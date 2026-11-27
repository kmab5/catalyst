import type { ErrorCode } from '@catalyst/shared';

export class CatalystError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'CatalystError';
  }
}
