import { Request, Response, Router } from "express";
import { loadConfig } from "./config";
import { generateFrame } from "./frame";

const router = Router();

// Upload image to ComfyUI's input directory
async function uploadToComfyUI(
  comfyUrl: string,
  imageBase64: string, // full data URL
  fileName: string
): Promise<{ name: string; subfolder: string; type: string }> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  const formData = new FormData();
  const blob = new Blob([buffer], { type: "image/jpeg" });
  formData.append("image", blob, fileName);

  const res = await fetch(`${comfyUrl}/upload/image`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI upload failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<{ name: string; subfolder: string; type: string }>;
}

// Submit workflow to ComfyUI
async function submitWorkflow(
  comfyUrl: string,
  workflowJson: string,
  uploadedFileName: string,
  uploadedType: string
): Promise<string> {
  const workflow = JSON.parse(workflowJson) as Record<string, any>;

  // Replace LoadImage node's "image" input with the uploaded file reference
  for (const [, node] of Object.entries(workflow)) {
    if (node.class_type === "LoadImage" && typeof node.inputs?.image === "string") {
      node.inputs.image = uploadedFileName;
      node.inputs.upload = "image";
    }
  }

  const res = await fetch(`${comfyUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: "kiosk-" + Date.now() }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI prompt failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { prompt_id: string };
  return data.prompt_id;
}

// Poll ComfyUI history for result
async function waitForResult(
  comfyUrl: string,
  promptId: string,
  timeoutMs: number = 120_000 // 2 minute timeout
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${comfyUrl}/history/${promptId}`);
    if (!res.ok) {
      throw new Error(`ComfyUI history check failed (${res.status})`);
    }
    const history = await res.json() as Record<string, any>;
    const promptHistory = history[promptId];

    if (promptHistory) {
      const outputs = promptHistory.outputs;
      if (outputs) {
        for (const [, nodeResult] of Object.entries(outputs)) {
          const images = (nodeResult as any).images;
          if (images && Array.isArray(images) && images.length > 0) {
            const imageRef = images[0];
            const filename = imageRef.filename;
            const subfolder = imageRef.subfolder || "";
            const type = imageRef.type || "output";

            const imgRes = await fetch(
              `${comfyUrl}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${type}`
            );
            if (!imgRes.ok) {
              throw new Error(`Failed to fetch generated image (${imgRes.status})`);
            }
            const arrayBuffer = await imgRes.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString("base64");
            const contentType = imgRes.headers.get("content-type") || "image/png";
            return `data:${contentType};base64,${base64}`;
          }
        }
      }

      if (promptHistory.status?.error) {
        throw new Error(`ComfyUI execution error: ${promptHistory.status.error}`);
      }
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(`ComfyUI workflow timed out after ${timeoutMs}ms`);
}

// POST /api/ai/generate
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { photoId, buttonId } = req.body;
    if (!photoId) {
      return res.status(400).json({ error: "photoId is required" });
    }
    if (!buttonId) {
      return res.status(400).json({ error: "buttonId is required" });
    }

    const config = loadConfig();
    const { comfyServerUrl, buttons } = config.ai;

    if (!comfyServerUrl) {
      return res.status(400).json({ error: "ComfyUI server URL not configured" });
    }

    const btn = buttons.find((b) => b.id === buttonId);
    if (!btn) {
      return res.status(400).json({ error: `Unknown buttonId: ${buttonId}` });
    }

    const { workflowJson } = btn;
    if (!workflowJson) {
      return res.status(400).json({ error: `Workflow JSON not configured for button: ${buttonId}` });
    }

    // Accept either a JSON string or a parsed object (object is more readable
    // in settings.json; string is what the UI sends).
    let workflow: Record<string, any>;
    let workflowStr: string;
    if (typeof workflowJson === "string") {
      try {
        workflow = JSON.parse(workflowJson);
      } catch {
        return res.status(400).json({ error: `Workflow JSON for button '${buttonId}' is not valid JSON` });
      }
      workflowStr = workflowJson;
    } else {
      workflow = workflowJson as Record<string, any>;
      workflowStr = JSON.stringify(workflow);
    }

    const photoRes = await fetch(`http://127.0.0.1:${process.env.PORT || 4000}/api/photos/${photoId}`);
    if (!photoRes.ok) {
      return res.status(400).json({ error: `Failed to fetch raw photo (${photoRes.status})` });
    }
    const photoBuffer = Buffer.from(await photoRes.arrayBuffer());

    const uploadResult = await uploadToComfyUI(
      comfyServerUrl,
      `data:image/jpeg;base64,${photoBuffer.toString("base64")}`,
      `kiosk_${photoId}_${buttonId}.jpg`
    );

    const promptId = await submitWorkflow(comfyServerUrl, workflowStr, uploadResult.name, uploadResult.type);

    const resultImageUrl = await waitForResult(comfyServerUrl, promptId);

    const base64Data = resultImageUrl.replace(/^data:image\/\w+;base64,/, "");
    const resultBuffer = Buffer.from(base64Data, "base64");
    const framedBuffer = await generateFrame(resultBuffer);

    res.json({ imageUrl: `data:image/jpeg;base64,${framedBuffer.toString("base64")}` });
  } catch (err: any) {
    console.error("AI generate error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

export { router as aiRouter };
