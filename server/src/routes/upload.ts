import { Router } from "express";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import type { ApiResponse } from "@curator/shared";

const UPLOADS_DIR = path.resolve("uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomUUID() + ext;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

export function createUploadRouter(): Router {
  const router = Router();

  router.post("/", upload.single("image"), (req, res) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No file uploaded" });
      return;
    }
    const url = `/uploads/${req.file.filename}`;
    const body: ApiResponse<{ url: string }> = { success: true, data: { url } };
    res.json(body);
  });

  return router;
}
