/**
 * Normalização de nomes de itens, num único lugar (app, servidor, catálogo e Jev).
 *
 * Três níveis, do mais leve ao mais agressivo:
 *  - `foldText`: sem acento, minúsculas e espaços simples. "Geladeira " e "geladeira" são o mesmo texto.
 *  - `normalizeText`: além disso, sem pontuação. Serve para cabeçalhos de planilha e comparações soltas.
 *  - `itemKey`: a identidade do item no catálogo. Tira palavras vazias, qualificadores que não mudam o que
 *    o item é (tamanho, voltagem, "de casal", cor, marca) e passa cada palavra para o singular. "Travesseiros",
 *    "travesseiro" e "Travesseiro de casal" viram "travesseiro". É conservadora de propósito: "panela" e
 *    "panela de pressão" continuam diferentes (quem decide a dúvida é a cascata do catálogo).
 */

const COMBINING_MARKS = /[̀-ͯ]/g;

export function foldText(value: string) {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Minúsculas, sem acentos nem pontuação: "Situação" e "situacao" viram a mesma coisa. */
export function normalizeText(value: string) {
  return foldText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

const STOPWORDS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "d", "e", "em", "na", "no", "nas", "nos",
  "para", "pra", "p", "com", "c", "um", "uma", "ou",
]);

/** Qualificadores que descrevem uma variação, e não outro item. */
const QUALIFIERS = new Set([
  "casal", "solteiro", "queen", "king", "viuva", "grande", "pequeno", "pequena", "medio", "media", "mini",
  "novo", "nova", "bivolt", "branco", "branca", "preto", "preta", "inox", "cinza", "colorido", "colorida",
  "premium", "basico", "basica", "simples", "unidade", "unidades", "un", "pecas", "peca", "pcs",
]);

/** Marcas comuns em títulos de lojas: não mudam o que o item é. */
const BRANDS = new Set([
  "mondial", "philco", "electrolux", "brastemp", "consul", "arno", "britania", "tramontina", "oster", "samsung",
  "lg", "midea", "philips", "walita", "cadence", "wap", "karcher", "tefal", "rochedo", "fischer", "panasonic",
  "continental", "esmaltec", "suggar", "elgin", "agratto", "multilaser", "ortobom", "castor", "probel", "etna",
  "camesa", "buddemeyer", "santista", "altenburg", "oxford", "nespresso", "dolce", "gusto", "xiaomi", "positivo",
]);

/** Medidas como "5l", "220v", "1200w", "30cm", "12kg", "1,5l" ou um número solto. */
const MEASURE = /^\d+([.,]\d+)?(l|lt|ml|kg|g|cm|mm|m|w|v|litros|x\d+)?$/;

/** Plural para singular em português, só nas terminações regulares; o resto fica como está. */
export function singular(word: string) {
  if (word.length <= 3) return word;
  if (word.endsWith("oes") || word.endsWith("aes")) return `${word.slice(0, -3)}ao`;
  if (word.endsWith("eis") && word.length > 4) return `${word.slice(0, -3)}el`;
  if (word.endsWith("ais")) return `${word.slice(0, -3)}al`;
  if (word.endsWith("ois")) return `${word.slice(0, -3)}ol`;
  if (word.endsWith("ns")) return `${word.slice(0, -2)}m`;
  if (/(r|z)es$/.test(word) && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) return word.slice(0, -1);
  return word;
}

/** Unidades escritas por extenso depois de um número ("5 litros", "2 portas", "3 lugares"). Sozinhas, ficam. */
const UNITS = new Set([
  "litro", "litros", "ml", "kg", "g", "cm", "mm", "m", "w", "v", "volt", "volts", "watt", "watts", "polegada",
  "polegadas", "lugar", "lugares", "porta", "portas", "boca", "bocas", "gaveta", "gavetas", "peca", "pecas", "un",
]);

/** Identidade do item no catálogo. Pode ficar vazia (só palavras vazias ou medidas): quem chama trata. */
export function itemKey(value: string) {
  const words = normalizeText(value.replace(/\(.*?\)/g, " ")).split(" ");
  const kept: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (MEASURE.test(word)) {
      if (UNITS.has(words[i + 1] ?? "")) i += 1;
      continue;
    }
    if (word && !STOPWORDS.has(word) && !QUALIFIERS.has(word) && !BRANDS.has(word)) kept.push(singular(word));
  }
  return kept.join(" ");
}

/** A chave sem espaços: "air fryer" e "airfryer" se encontram. */
export const compactKey = (key: string) => key.replace(/ /g, "");

/** Identificador estável e legível para URLs e traduções ("jogo-cama"). */
export function slugify(value: string) {
  return (itemKey(value) || normalizeText(value)).replace(/ /g, "-").slice(0, 80) || "item";
}

/* ----------------------------------------------------------- similaridade */

/** Trigramas no estilo do pg_trgm: cada palavra com dois espaços antes e um depois. */
export function trigrams(key: string): Set<string> {
  const result = new Set<string>();
  for (const word of key.split(" ")) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i += 1) result.add(padded.slice(i, i + 3));
  }
  return result;
}

/** Coeficiente de Jaccard entre dois conjuntos de trigramas (0 a 1), como `similarity()` do pg_trgm. */
export function trigramSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const gram of small) if (large.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
}
