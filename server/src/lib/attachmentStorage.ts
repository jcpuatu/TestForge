import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Filename is prefixed with the attachment's own id and stripped of anything but
// alphanumerics/dots/dashes/underscores — avoids path traversal and collisions without needing
// a separate lookup table mapping ids to original names (the original name is kept as-is in
// Attachment.filename for display; only the on-disk name is sanitized).
export function saveFile(id: string, originalFilename: string, buffer: Buffer): string {
  ensureUploadsDir();
  const safeName = `${id}-${originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fullPath = path.join(UPLOADS_DIR, safeName);
  fs.writeFileSync(fullPath, buffer);
  return fullPath;
}

export function deleteFile(storagePath: string) {
  if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
}
