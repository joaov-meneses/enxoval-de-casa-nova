/**
 * Normalização de nomes de itens e similaridade entre eles. Uma só implementação para o catálogo, a deduplicação
 * e a busca, no servidor e na tela.
 *
 * `normalizeName` produz a chave que o catálogo compara: sem acento nem caixa, sem pontuação, sem palavras vazias,
 * sem qualificadores de tamanho, voltagem e público ("5L", "110V", "de casal") e com cada palavra no singular.
 * A normalização é conservadora de propósito: "panela" e "panela de pressão" continuam diferentes.
 */

const STOP_WORDS = new Set(["de", "da", "do", "das", "dos", "para", "pra", "com", "e", "a", "o", "as", "os", "um", "uma", "em", "no", "na"]);
/** Palavras que só qualificam o item (quem usa ou o tamanho) e não mudam o que ele é. */
const QUALIFIERS = new Set([
  "casal", "solteiro", "queen", "king", "grande", "pequeno", "pequena", "medio", "media",
  "litro", "litros", "volt", "volts", "watt", "watts", "polegada", "polegadas", "quilo", "quilos",
]);
/** Medidas coladas ou não ao número: 5l, 110v, 2m, 500ml, 3kg, 1,5l. */
const MEASURE = /^\d+([.,]\d+)?(l|lt|lts|ml|v|w|kg|g|m|cm|mm|pcs|pecas|un)?$/;

/** Plural → singular para o português, só nos casos regulares; o que não reconhece fica como está. */
function singular(word: string) {
  if (word.length <= 3) return word;
  if (word.endsWith("oes") || word.endsWith("aes")) return `${word.slice(0, -3)}ao`;
  if (word.endsWith("ais") || word.endsWith("eis") || word.endsWith("ois")) return `${word.slice(0, -2)}l`;
  if (word.endsWith("ns")) return `${word.slice(0, -2)}m`;
  if (word.endsWith("res") || word.endsWith("zes")) return word.slice(0, -2);
  if (word.endsWith("ss") || word.endsWith("us") || word.endsWith("is")) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

export function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeName(value: string) {
  const words = stripAccents(value)
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9,. ]+/g, " ")
    .replace(/\.(?!\d)|,(?!\d)/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(word => !STOP_WORDS.has(word) && !QUALIFIERS.has(word) && !MEASURE.test(word))
    .map(singular);
  return words.join(" ");
}

/** Trigramas como no `pg_trgm`: cada palavra com dois espaços antes e um depois. */
export function trigrams(value: string) {
  const set = new Set<string>();
  for (const word of value.split(" ").filter(Boolean)) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i += 1) set.add(padded.slice(i, i + 3));
  }
  return set;
}

/** Interseção sobre união de dois conjuntos de trigramas (0 a 1). */
export function jaccard(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Similaridade de 0 a 1 entre dois nomes já normalizados. */
export function similarity(a: string, b: string) {
  if (a === b) return a ? 1 : 0;
  return jaccard(trigrams(a), trigrams(b));
}
