import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import crypto from 'crypto';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { saveFile, deleteFile } from '../../lib/attachmentStorage';

const WRITE_ROLES = ['ADMIN', 'LEAD', 'TESTER'] as const;

// 10MB cap, in-memory buffer (we write it to disk ourselves via attachmentStorage, giving full
// control over the on-disk filename rather than trusting multer's own disk-storage naming).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function toPublicAttachment(a: { storagePath: string; [key: string]: unknown }) {
  const { storagePath, ...rest } = a;
  void storagePath; // never exposed to the client — it's a server-local filesystem detail
  return rest;
}

// Mounted at /api/v1/cases/:caseId/attachments
export const caseAttachmentsRouter = Router({ mergeParams: true });
caseAttachmentsRouter.use(requireAuth);

caseAttachmentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const attachments = await prisma.attachment.findMany({
      where: { caseId: req.params.caseId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ attachments: attachments.map(toPublicAttachment) });
  }),
);

caseAttachmentsRouter.post(
  '/',
  requireRole(...WRITE_ROLES),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const testCase = await prisma.testCase.findUnique({ where: { id: req.params.caseId } });
    if (!testCase) throw new NotFoundError('Test case');
    if (!req.file) throw new BadRequestError('No file uploaded (expected multipart field "file")');

    // Write the file to disk BEFORE creating the DB row, not after — the reverse order (create
    // row with a placeholder storagePath, then save, then update) left a permanent phantom
    // Attachment row (storagePath: '') whenever the disk write failed, e.g. an over-long
    // filename on Windows. A row genuinely referencing a file that exists is the only state this
    // table should ever contain; an orphaned file with no DB row on the rare reverse failure is a
    // harmless leftover, not a listing/download bug.
    const id = crypto.randomUUID();
    const storagePath = saveFile(id, req.file.originalname, req.file.buffer);
    const attachment = await prisma.attachment.create({
      data: { id, filename: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size, storagePath, caseId: testCase.id, uploadedById: req.user!.id },
    });
    res.status(201).json({ attachment: toPublicAttachment(attachment) });
  }),
);

// Mounted at /api/v1/results/:resultId/attachments
export const resultAttachmentsRouter = Router({ mergeParams: true });
resultAttachmentsRouter.use(requireAuth);

resultAttachmentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const attachments = await prisma.attachment.findMany({
      where: { resultId: req.params.resultId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ attachments: attachments.map(toPublicAttachment) });
  }),
);

resultAttachmentsRouter.post(
  '/',
  requireRole(...WRITE_ROLES),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const result = await prisma.result.findUnique({ where: { id: req.params.resultId } });
    if (!result) throw new NotFoundError('Result');
    if (!req.file) throw new BadRequestError('No file uploaded (expected multipart field "file")');

    // Same save-before-create ordering as caseAttachmentsRouter above, and for the same reason.
    const id = crypto.randomUUID();
    const storagePath = saveFile(id, req.file.originalname, req.file.buffer);
    const attachment = await prisma.attachment.create({
      data: { id, filename: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size, storagePath, resultId: result.id, uploadedById: req.user!.id },
    });
    res.status(201).json({ attachment: toPublicAttachment(attachment) });
  }),
);

// Mounted at /api/v1/attachments
export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

attachmentsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!attachment || !fs.existsSync(attachment.storagePath)) throw new NotFoundError('Attachment');
    // Always forces a download rather than inline rendering — an uploaded .html/.svg file
    // rendered inline by the browser would be a stored-XSS vector; attachment storage has no
    // other access control on content type, so this is the one line of defense against it.
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename.replace(/"/g, '')}"`);
    res.sendFile(attachment.storagePath);
  }),
);

attachmentsRouter.delete(
  '/:id',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!attachment) throw new NotFoundError('Attachment');
    await prisma.attachment.delete({ where: { id: attachment.id } });
    deleteFile(attachment.storagePath);
    res.status(204).send();
  }),
);
