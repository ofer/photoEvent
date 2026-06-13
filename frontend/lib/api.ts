export const API_BASE = "";

export async function getPhotos() {
  const res = await fetch(`${API_BASE}/api/photos`);
  if (!res.ok) throw new Error("Failed to fetch photos");
  return res.json();
}

export async function uploadPhoto(file: File) {
  const formData = new FormData();
  formData.append("photo", file);
  const res = await fetch(`${API_BASE}/api/photos`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

export async function getEventConfig() {
  const res = await fetch(`${API_BASE}/api/event`);
  if (!res.ok) throw new Error("Failed to fetch event config");
  return res.json();
}
