/** Maior arquivo aceito no envio (depois o servidor reduz e converte). */
export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Formatos que o servidor sabe ler. SVG fica de fora de propósito: pode carregar script. */
export const IMAGE_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
