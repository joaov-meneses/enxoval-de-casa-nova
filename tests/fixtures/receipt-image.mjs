import sharp from 'sharp';
export async function receiptFixture() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="740"><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif" font-size="48" fill="black"><text x="60" y="100">CASA TESTE LTDA</text><text x="60" y="210">NOTA FISCAL</text><text x="60" y="320">EMISSAO 23/10/2026</text><text x="60" y="430">QTD TOTAL DE ITENS: 2</text><text x="60" y="540">VALOR TOTAL R$ 123,45</text></g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
