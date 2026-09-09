const MAX_UPLOAD_FILE_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 750 * 1024;
const MAX_IMAGE_DIMENSION = 900;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to process image file"));
    image.src = dataUrl;
  });
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

export async function prepareProductImageDataUrl(file) {
  if (!file) return "";
  if (!file.type?.startsWith("image/")) {
    throw new Error("Please upload a valid image file");
  }
  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    throw new Error("Image is too large. Please upload an image up to 5 MB.");
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(image.width || 1, image.height || 1),
  );
  const width = Math.max(1, Math.round((image.width || 1) * scale));
  const height = Math.max(1, Math.round((image.height || 1) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to process image file");
  ctx.drawImage(image, 0, 0, width, height);

  let quality = 0.82;
  let output = canvas.toDataURL("image/jpeg", quality);
  while (estimateDataUrlBytes(output) > MAX_OUTPUT_BYTES && quality > 0.45) {
    quality -= 0.08;
    output = canvas.toDataURL("image/jpeg", quality);
  }

  if (estimateDataUrlBytes(output) > MAX_OUTPUT_BYTES) {
    throw new Error(
      "Image is still too large after compression. Please use a smaller image.",
    );
  }

  return output;
}

export async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      response.ok
        ? fallbackMessage
        : `${fallbackMessage}. Server returned a non-JSON error page.`,
    );
  }
}
