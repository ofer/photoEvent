// Use relative paths — Next.js middleware proxies /api/* to the backend server-side
export const API_BASE = "";

export async function getPhotos() {
  const res = await fetch(`/api/photos`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Failed to fetch photos (${res.status})`);
  return res.json();
}

export async function uploadPhoto(file: File) {
  const formData = new FormData();
  formData.append("photo", file);

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

export async function getEventConfig() {
  const res = await fetch(`/api/event`);
  if (!res.ok) throw new Error(`Failed to fetch event config (${res.status})`);
  return res.json();
}
