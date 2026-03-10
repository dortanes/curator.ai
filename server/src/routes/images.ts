import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { ApiResponse } from "@curator/shared";

const UPLOADS_DIR = path.resolve("uploads");

interface ImageResult {
  url: string;
  width: number;
  height: number;
}

export function createImagesRouter(): Router {
  const router = Router();

  // GET /api/images/search?q=query&page=0
  router.get("/search", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const page = Math.max(0, Number(req.query.page) || 0);
      if (!query.trim()) {
        res.json({ success: true, data: { images: [] } });
        return;
      }

      const perPage = 20;
      const { GOOGLE_IMG_SCRAP } = await import("google-img-scrap");
      const result = await GOOGLE_IMG_SCRAP({
        search: query,
        limit: perPage,
        custom: page > 0 ? `ijn=${page}&start=${page * perPage}` : undefined,
      });

      const images: ImageResult[] = (result.result || [])
        .filter((img: any) => img.url && img.url.startsWith("http"))
        .slice(0, perPage)
        .map((img: any) => ({
          url: img.url,
          width: img.width || 0,
          height: img.height || 0,
        }));

      const body: ApiResponse<{ images: ImageResult[] }> = {
        success: true,
        data: { images },
      };
      res.json(body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Images] Search failed:", message);
      res.status(500).json({ success: false, error: message });
    }
  });

  // POST /api/images/download — download remote image to local uploads
  router.post("/download", async (req, res) => {
    try {
      const { url } = req.body as { url: string };
      if (!url || !url.startsWith("http")) {
        res.status(400).json({ success: false, error: "Invalid URL" });
        return;
      }

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CuratorBot/1.0)",
        },
      });

      if (!response.ok) {
        res.status(502).json({ success: false, error: `Failed to fetch image: ${response.status}` });
        return;
      }

      let buffer: Buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || "";
      const isWebp = contentType.includes("webp") || url.toLowerCase().includes(".webp");

      // Convert WebP to JPG — Telegram doesn't support WebP for photos
      if (isWebp) {
        const sharp = (await import("sharp")).default;
        buffer = await sharp(new Uint8Array(buffer)).jpeg({ quality: 90 }).toBuffer();
      }

      let ext = ".jpg";
      if (!isWebp) {
        if (contentType.includes("png")) ext = ".png";
        else if (contentType.includes("gif")) ext = ".gif";
        else if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = ".jpg";
      }

      const filename = crypto.randomUUID() + ext;
      const filePath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filePath, buffer);

      const localUrl = `/uploads/${filename}`;
      const body: ApiResponse<{ url: string }> = { success: true, data: { url: localUrl } };
      res.json(body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Images] Download failed:", message);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
