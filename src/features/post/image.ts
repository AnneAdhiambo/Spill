import { MAX_PHOTO_BYTES } from "./config";

export type CleanPhoto = { blob: Blob; mime: string; sha256: string; width: number; height: number; notes: string[] };

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const EDITORS = ["Photoshop", "Lightroom", "GIMP", "Snapseed", "Canva", "Picsart", "Facetune", "FaceApp", "Pixelmator", "Affinity", "PhotoScape", "Adobe"];

/** Reads the ORIGINAL file's metadata (on device only) and reports what it contains. Nothing here is uploaded. */
async function inspectMetadata(file: File): Promise<string[]> {
  const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  let text = "";
  for (let i = 0; i < head.length; i++) text += String.fromCharCode(head[i]);
  const notes: string[] = [];
  if (text.includes("Exif\0\0") || text.includes("EXIF")) notes.push("EXIF");
  if (text.includes("http://ns.adobe.com/xap/") || text.includes("<x:xmpmeta")) notes.push("XMP");
  const editors = EDITORS.filter((e) => text.includes(e));
  if (editors.length) notes.push(`editing software tags: ${editors.join(", ")}`);
  return notes;
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Reads metadata, then re-encodes through a canvas so every metadata block (GPS, camera, timestamps) is dropped.
 * EXIF orientation is applied first by the decoder (imageOrientation: "from-image").
 * This does not prove the photo is real.
 */
export async function cleanPhoto(file: File): Promise<CleanPhoto> {
  if (!ALLOWED.includes(file.type)) throw new Error("Use a JPEG, PNG or WebP photo.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("That photo is over 5 MB.");
  const notes = await inspectMetadata(file);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process images.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, file.type, 0.9));
  if (!blob || blob.type !== file.type) throw new Error("This browser could not re-encode that photo type.");
  if (blob.size > MAX_PHOTO_BYTES) throw new Error("The cleaned photo is still over 5 MB.");
  return { blob, mime: blob.type, sha256: await sha256Hex(blob), width, height, notes };
}
