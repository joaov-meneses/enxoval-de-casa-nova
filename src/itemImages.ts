/** Imagens de itens guardadas no banco: o item aponta para elas por um endereço interno estável. */
export const ITEM_IMAGE_PATH = "/api/item-images/";

const INTERNAL_IMAGE = /^\/api\/item-images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Id da imagem quando o endereço é o de uma imagem guardada no banco; `null` para qualquer outro endereço. */
export function internalImageId(url: unknown): string | null {
  return typeof url === "string" ? (INTERNAL_IMAGE.exec(url)?.[1]?.toLowerCase() ?? null) : null;
}

export const itemImageUrl = (id: string) => `${ITEM_IMAGE_PATH}${id}`;

/** Maior arquivo aceito no envio (depois o servidor reduz e converte). */
export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Formatos que o servidor sabe ler. SVG fica de fora de propósito: pode carregar script. */
export const IMAGE_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
