import { CatalystError } from '@catalyst/core';
import { ErrorCode, type ErrorBody } from '@catalyst/shared';
import { ZodError } from 'zod';

const status = { BAD_REQUEST: 400, UNAUTHORIZED: 401, PROJECT_NOT_FOUND: 404, NODE_NOT_FOUND: 404,
  PATH_NOT_FOUND: 404, NOT_INDEXED: 409, INDEX_RUNNING: 409, AI_NOT_CONFIGURED: 412,
  PROVIDER_ERROR: 502, INTERNAL: 500, NOT_IMPLEMENTED: 501 } as const;

export function publicError(error: unknown): { status: typeof status[ErrorCode]; body: ErrorBody } {
  if (error instanceof ZodError) return { status: 400, body: { error: {
    code: 'BAD_REQUEST', message: 'Invalid request', details: error.issues.map(({ path, code }) => ({ path, code })),
  } } };
  if (error instanceof CatalystError || (error instanceof Error && 'code' in error && ErrorCode.safeParse(error.code).success)) {
    const { code, message, details } = error as CatalystError;
    const safeMessage = message.replace(/(?:sk[-_][\w.-]+|Bearer\s+\S+|(?:api[_-]?key|token)\s*[:=]\s*\S+)/gi, '[redacted]');
    return { status: status[code], body: { error: { code, message: safeMessage,
      ...(code === 'INDEX_RUNNING' && typeof details === 'object' && details !== null && 'runId' in details ? { details: { runId: details.runId } } : {}),
    } } };
  }
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'An internal error occurred.' } } };
}
