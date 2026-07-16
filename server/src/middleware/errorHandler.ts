import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { AppError } from '../lib/errors';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', issues: err.issues },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }

  // body-parser's PayloadTooLargeError (thrown by express.json() before a request even reaches
  // a route handler) isn't an AppError, so without this it fell through to the generic 500 below
  // — a real request that was simply too large surfaced as an unexplained "Something went wrong".
  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
    });
  }

  // multer throws its own error class for an oversized attachment upload — a different code path
  // than express.json()'s body limit above, but the identical class of problem (a real, expected
  // failure mode surfacing as an unexplained 500 instead of a clear one).
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'File is too large (10MB limit)' } });
    }
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }

  // A raw Prisma error reaching here means a route wrote data its own Zod schema didn't (or
  // couldn't) catch — a duplicate unique field, a dangling foreign key id (e.g. an assignedToId,
  // milestoneId, or parentId that doesn't exist), or a malformed value Prisma's client-side
  // validation rejects before ever reaching the DB. These are real client mistakes, not server
  // bugs — map the common cases to a clean 4xx instead of an opaque "Something went wrong" 500.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      return res.status(400).json({ error: { code: 'DUPLICATE', message: `A record with this ${target} already exists` } });
    }
    if (err.code === 'P2003') {
      return res.status(400).json({ error: { code: 'INVALID_REFERENCE', message: 'A referenced record does not exist' } });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request data' } });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
