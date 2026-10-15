/**
 * Cidades que o catálogo conhece. A cidade refina o estado: o estado decide o clima geral; a cidade
 * acrescenta características locais (umidade, maresia, estação seca, chuva forte) que mudam quais itens
 * fazem sentido. São generalizações do clima típico de cada cidade, não previsão do tempo, e só servem
 * para sugerir itens opcionais. Quem mora em outra cidade escolhe "Outra cidade" e recebe o catálogo do estado.
 */

/**
 * umido   umidade alta o ano todo: mofo e roupa que demora a secar.
 * maresia ar salgado do litoral: corrói metais e eletrônicos.
 * seco    estação seca marcada (ar muito seco no inverno).
 * chuvoso chuvas fortes e frequentes: roupa não seca ao ar livre, entrada molhada.
 */
export type Trait = "umido" | "maresia" | "seco" | "chuvoso";

export interface City {
  id: string;
  name: string;
  uf: string;
  traits: Trait[];
}

const c = (id: string, name: string, uf: string, traits: Trait[]): City => ({
  id,
  name,
  uf,
  traits,
});

export const CITIES: City[] = [
  c("rio-branco", "Rio Branco", "AC", ["umido", "chuvoso"]),
  c("maceio", "Maceió", "AL", ["umido", "maresia"]),
  c("macapa", "Macapá", "AP", ["umido", "chuvoso"]),
  c("manaus", "Manaus", "AM", ["umido", "chuvoso"]),
  c("salvador", "Salvador", "BA", ["umido", "maresia"]),
  c("fortaleza", "Fortaleza", "CE", ["maresia"]),
  c("brasilia", "Brasília", "DF", ["seco"]),
  c("vitoria", "Vitória", "ES", ["umido", "maresia"]),
  c("goiania", "Goiânia", "GO", ["seco"]),
  c("sao-luis", "São Luís", "MA", ["umido", "maresia", "chuvoso"]),
  c("cuiaba", "Cuiabá", "MT", ["seco"]),
  c("campo-grande", "Campo Grande", "MS", ["seco"]),
  c("belo-horizonte", "Belo Horizonte", "MG", ["seco"]),
  c("belem", "Belém", "PA", ["umido", "chuvoso"]),
  c("joao-pessoa", "João Pessoa", "PB", ["umido", "maresia"]),
  c("curitiba", "Curitiba", "PR", ["umido"]),
  c("recife", "Recife", "PE", ["umido", "maresia", "chuvoso"]),
  c("teresina", "Teresina", "PI", ["seco"]),
  c("rio-de-janeiro", "Rio de Janeiro", "RJ", ["umido", "maresia"]),
  c("natal", "Natal", "RN", ["maresia"]),
  c("porto-alegre", "Porto Alegre", "RS", ["umido"]),
  c("porto-velho", "Porto Velho", "RO", ["umido", "chuvoso"]),
  c("boa-vista", "Boa Vista", "RR", ["seco"]),
  c("florianopolis", "Florianópolis", "SC", ["umido", "maresia"]),
  c("sao-paulo", "São Paulo", "SP", ["seco"]),
  c("aracaju", "Aracaju", "SE", ["umido", "maresia"]),
  c("palmas", "Palmas", "TO", ["seco"]),
  // Grandes cidades que não são capitais.
  c("campinas", "Campinas", "SP", ["seco"]),
  c("guarulhos", "Guarulhos", "SP", ["seco"]),
  c("ribeirao-preto", "Ribeirão Preto", "SP", ["seco"]),
  c("santos", "Santos", "SP", ["umido", "maresia"]),
  c("niteroi", "Niterói", "RJ", ["umido", "maresia"]),
  c("uberlandia", "Uberlândia", "MG", ["seco"]),
  c("joinville", "Joinville", "SC", ["umido", "chuvoso"]),
];

/** Estados do Nordeste (itens marcados com N no catálogo). */
export const NORDESTE = new Set(["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"]);

const BY_ID = new Map(CITIES.map((city) => [city.id, city]));

export function cityById(id: string | null | undefined): City | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/** Cidades de um estado, na ordem em que aparecem na lista (capital primeiro). */
export function citiesOfState(uf: string | null | undefined): City[] {
  return uf ? CITIES.filter((city) => city.uf === uf) : [];
}

export function traitsOfCity(id: string | null | undefined): Set<Trait> {
  return new Set(cityById(id)?.traits ?? []);
}

/** A cidade existe e pertence ao estado informado (a cidade nunca contradiz o estado). */
export function cityMatchesState(cityId: string, uf: string | null | undefined) {
  const city = cityById(cityId);
  return Boolean(city && uf && city.uf === uf);
}

/** O que a cidade acrescenta ao catálogo, em palavras, para mostrar à pessoa. */
export const TRAIT_COPY: Record<Trait, string> = {
  umido: "umidade alta o ano todo (mofo e roupa que demora a secar)",
  maresia: "ar salgado do litoral (corrói metais e eletrônicos)",
  seco: "estação seca bem marcada (ar muito seco no inverno)",
  chuvoso: "chuvas fortes e frequentes",
};
