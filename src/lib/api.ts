/** Turn backend errors into short, safe, user-facing text. Never leak raw backend messages. */
export function userMessage(error: unknown, fallback = "Something went wrong") {
  const text = String((error as { message?: string } | null)?.message ?? "");
  if (/invalid login credentials/i.test(text)) return "Wrong email or password";
  if (/already registered|already been registered/i.test(text)) return "Email already in use";
  if (/email not confirmed/i.test(text)) return "Confirm your email first";
  if (/password/i.test(text) && /(least|short|weak)/i.test(text)) return "Password is too short";
  if (/rate limit|too many/i.test(text)) return "Too many attempts. Try later";
  return fallback;
}

/** Moderation errors: useful for admins, never exposing backend internals. */
export function moderationMessage(error: unknown) {
  const text = String((error as { message?: string } | null)?.message ?? "");
  if (text.includes("NOT_AUTHORIZED")) return "You don't have permission to do that";
  if (text.includes("NOT_FOUND")) return "This request no longer exists";
  if (text.includes("ALREADY_REJECTED")) return "Already rejected";
  if (text.includes("ALREADY_APPROVED")) return "Already approved";
  return "Couldn't complete the action. Try again";
}

/** Downscale large phone photos before upload. Falls back to the original file on any failure. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  try {
    if (file.size < 400 * 1024) return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
