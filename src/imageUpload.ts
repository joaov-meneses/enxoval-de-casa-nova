import { MAX_IMAGE_UPLOAD_BYTES } from "./imageUploadLimits";

/** Fotos de celular passam fácil de 5 MB; antes de enviar, reduzimos para o que o servidor vai guardar de qualquer jeito. */
const SEND_MAX_SIDE = 1280;
const SEND_QUALITY = 0.86;
/** Abaixo disso o arquivo já é leve: segue como está, sem perder qualidade com uma segunda compressão. */
const LIGHT_BYTES = 1.2 * 1024 * 1024;

/**
 * Prepara o arquivo escolhido para o envio: respeita a rotação da foto, reduz o maior lado e comprime quando
 * o arquivo é pesado. Se o navegador não conseguir abrir o formato, o original segue e o servidor decide.
 */
export async function prepareImageForUpload(file: File): Promise<Blob> {
  if (file.type === "image/gif" || (file.size <= LIGHT_BYTES && file.type.startsWith("image/"))) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, SEND_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    // JPEG não tem transparência: o fundo branco evita áreas pretas em PNGs com recorte.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", SEND_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Mensagem de erro para um arquivo que não vale a pena enviar; `null` quando pode seguir. */
export function imageFileProblem(file: File): string | null {
  if (file.type && !file.type.startsWith("image/")) return "Escolha um arquivo de imagem (JPG, PNG, WebP, GIF ou AVIF).";
  if (file.type === "image/svg+xml") return "SVG não é aceito. Use JPG, PNG, WebP, GIF ou AVIF.";
  if (file.size > MAX_IMAGE_UPLOAD_BYTES * 4) return "Esse arquivo é grande demais. Escolha uma imagem de até 30 MB.";
  return null;
}
