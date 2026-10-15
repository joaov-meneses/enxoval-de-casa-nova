let context: CanvasRenderingContext2D | null | undefined;

/** Largura em pixels de um texto numa linha só, medida com a fonte real. Sem canvas, estima pelo número de letras. */
export function measureTextWidth(text: string, font: string) {
  if (context === undefined) {
    try {
      context = document.createElement("canvas").getContext("2d");
    } catch {
      context = null;
    }
  }
  if (!context) return text.length * 7.4;
  context.font = font;
  return context.measureText(text).width;
}
