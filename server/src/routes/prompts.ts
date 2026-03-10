import { Router } from "express";
import type { ApiResponse } from "@curator/shared";
import { PromptManager } from "../services/PromptManager.js";

export function createPromptsRouter(promptManager: PromptManager): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const prompts = promptManager.listAll().map((p) => ({
      name: p.meta.name,
      model: p.meta.model || "",
      temperature: p.meta.temperature ?? 0.3,
      description: p.meta.description || "",
      template: p.template,
    }));

    const body: ApiResponse<typeof prompts> = { success: true, data: prompts };
    res.json(body);
  });

  router.put("/:name", (req, res) => {
    const { name } = req.params;
    const { template, model, temperature, description } = req.body;

    if (!template || typeof template !== "string") {
      return res.status(400).json({ success: false, error: "template is required" });
    }

    try {
      promptManager.update(name, template, { model, temperature, description });
      res.json({ success: true, data: { message: `Prompt "${name}" updated` } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: msg });
    }
  });

  return router;
}
