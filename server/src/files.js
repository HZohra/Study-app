import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import 'dotenv/config';

// Stores uploaded PDFs on disk. To move to Azure Blob Storage later,
// only this file and the places that read `file_path` need to change.

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const uploadPdf = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}.pdf`),
  }),
  limits: { fileSize: 32 * 1024 * 1024 }, // Claude API limit for a PDF
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(Object.assign(new Error('Only PDF files are supported. Export your slides as PDF first.'), { status: 400 }));
  },
}).single('file');

export function removeFile(filePath) {
  if (filePath) fs.rm(filePath, { force: true }, () => {});
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
