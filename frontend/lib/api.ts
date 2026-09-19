// Use relative paths — Next.js middleware proxies /api/* to the backend server-side
export const API_BASE = "";

export async function getPhotos() {
  const res = await fetch(`/api/photos`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Failed to fetch photos (${res.status})`);
  return res.json();
}

/**
 * Upload a photo to the kiosk. When the review screen is showing a
 * transformed preview, pass the applied AI button id in `aiButton`;
 * the original photo bytes are always what gets uploaded (the kiosk
 * re-applies the transform from the server-side cache).
 */
export async function uploadPhoto(file: File, aiButton?: string | null) {
  const formData = new FormData();
  formData.append("photo", file);
  if (aiButton) formData.append("aiButton", aiButton);

  const res = await fetch(`/api/photos`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error || `Upload failed (${res.status})`;
    throw new Error(message);
  }

  return res.json();
}

/**
 * Request an AI transform preview for a photo that is not uploaded yet.
 * Sends the ORIGINAL photo bytes (multipart field `photo`) plus the button id;
 * the backend applies the button's workflow through the shared on-disk cache
 * and returns an unframed data URL (the kiosk frames at print time).
 */
export async function transformPhoto(file: File, buttonId: string) {
  const formData = new FormData();
  formData.append("photo", file);
  formData.append("buttonId", buttonId);

  const res = await fetch(`/api/ai/transform`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error || `Transform failed (${res.status})`;
    throw new Error(message);
  }

  return res.json() as Promise<{ imageUrl: string }>;
}

export async function getEventConfig() {
  const res = await fetch(`/api/event`);
  if (!res.ok) throw new Error(`Failed to fetch event config (${res.status})`);
  return res.json();
}
