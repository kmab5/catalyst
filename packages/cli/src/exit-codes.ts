export const EXIT = {
  OK: 0,
  FAIL: 1,
  BAD_ARGS: 2,
  NOT_FOUND: 3,
  NO_AI: 4,
  PROVIDER: 5,
  NODE: 6,
  INTERRUPTED: 130,
} as const;

export class CliError extends Error {
  constructor(
    readonly exitCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorCode(error: unknown): number {
  if (error instanceof CliError) return error.exitCode;
  if (error && typeof error === 'object' && 'code' in error) {
    switch (error.code) {
      case 'BAD_REQUEST':
        return EXIT.BAD_ARGS;
      case 'ENOENT':
      case 'ENOTDIR':
      case 'PATH_NOT_FOUND':
      case 'PROJECT_NOT_FOUND':
      case 'NOT_INDEXED':
        return EXIT.NOT_FOUND;
      case 'AI_NOT_CONFIGURED':
        return EXIT.NO_AI;
      case 'PROVIDER_ERROR':
        return EXIT.PROVIDER;
    }
  }
  return EXIT.FAIL;
}
