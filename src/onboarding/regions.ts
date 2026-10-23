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
  // Grandes cidades que não são capitais, por estado (as maiores primeiro).
  c("cruzeiro-do-sul", "Cruzeiro do Sul", "AC", ["umido", "chuvoso"]),
  c("arapiraca", "Arapiraca", "AL", ["seco"]),
  c("santana", "Santana", "AP", ["umido", "chuvoso"]),
  c("parintins", "Parintins", "AM", ["umido", "chuvoso"]),
  c("itacoatiara", "Itacoatiara", "AM", ["umido", "chuvoso"]),
  c("feira-de-santana", "Feira de Santana", "BA", ["seco"]),
  c("vitoria-da-conquista", "Vitória da Conquista", "BA", ["seco"]),
  c("camacari", "Camaçari", "BA", ["umido", "maresia"]),
  c("juazeiro", "Juazeiro", "BA", ["seco"]),
  c("ilheus", "Ilhéus", "BA", ["umido", "maresia", "chuvoso"]),
  c("porto-seguro", "Porto Seguro", "BA", ["umido", "maresia"]),
  c("caucaia", "Caucaia", "CE", ["maresia"]),
  c("juazeiro-do-norte", "Juazeiro do Norte", "CE", ["seco"]),
  c("sobral", "Sobral", "CE", ["seco"]),
  c("ceilandia", "Ceilândia", "DF", ["seco"]),
  c("taguatinga", "Taguatinga", "DF", ["seco"]),
  c("vila-velha", "Vila Velha", "ES", ["umido", "maresia"]),
  c("serra", "Serra", "ES", ["umido", "maresia"]),
  c("cariacica", "Cariacica", "ES", ["umido"]),
  c("cachoeiro-de-itapemirim", "Cachoeiro de Itapemirim", "ES", []),
  c("aparecida-de-goiania", "Aparecida de Goiânia", "GO", ["seco"]),
  c("anapolis", "Anápolis", "GO", ["seco"]),
  c("rio-verde", "Rio Verde", "GO", ["seco"]),
  c("imperatriz", "Imperatriz", "MA", ["seco"]),
  c("sao-jose-de-ribamar", "São José de Ribamar", "MA", ["umido", "maresia", "chuvoso"]),
  c("caxias", "Caxias", "MA", ["seco"]),
  c("varzea-grande", "Várzea Grande", "MT", ["seco"]),
  c("rondonopolis", "Rondonópolis", "MT", ["seco"]),
  c("sinop", "Sinop", "MT", ["seco"]),
  c("dourados", "Dourados", "MS", ["seco"]),
  c("tres-lagoas", "Três Lagoas", "MS", ["seco"]),
  c("corumba", "Corumbá", "MS", ["seco"]),
  c("uberlandia", "Uberlândia", "MG", ["seco"]),
  c("contagem", "Contagem", "MG", ["seco"]),
  c("juiz-de-fora", "Juiz de Fora", "MG", ["umido"]),
  c("betim", "Betim", "MG", ["seco"]),
  c("montes-claros", "Montes Claros", "MG", ["seco"]),
  c("ananindeua", "Ananindeua", "PA", ["umido", "chuvoso"]),
  c("santarem", "Santarém", "PA", ["umido", "chuvoso"]),
  c("maraba", "Marabá", "PA", ["umido", "chuvoso"]),
  c("campina-grande", "Campina Grande", "PB", ["seco"]),
  c("santa-rita", "Santa Rita", "PB", ["umido"]),
  c("londrina", "Londrina", "PR", []),
  c("maringa", "Maringá", "PR", []),
  c("ponta-grossa", "Ponta Grossa", "PR", ["umido"]),
  c("cascavel", "Cascavel", "PR", []),
  c("foz-do-iguacu", "Foz do Iguaçu", "PR", ["umido"]),
  c("paranagua", "Paranaguá", "PR", ["umido", "maresia", "chuvoso"]),
  c("jaboatao-dos-guararapes", "Jaboatão dos Guararapes", "PE", ["umido", "maresia"]),
  c("olinda", "Olinda", "PE", ["umido", "maresia"]),
  c("caruaru", "Caruaru", "PE", ["seco"]),
  c("petrolina", "Petrolina", "PE", ["seco"]),
  c("parnaiba", "Parnaíba", "PI", ["maresia"]),
  c("picos", "Picos", "PI", ["seco"]),
  c("sao-goncalo", "São Gonçalo", "RJ", ["umido"]),
  c("duque-de-caxias", "Duque de Caxias", "RJ", ["umido"]),
  c("nova-iguacu", "Nova Iguaçu", "RJ", ["umido"]),
  c("niteroi", "Niterói", "RJ", ["umido", "maresia"]),
  c("campos-dos-goytacazes", "Campos dos Goytacazes", "RJ", []),
  c("petropolis", "Petrópolis", "RJ", ["umido", "chuvoso"]),
  c("cabo-frio", "Cabo Frio", "RJ", ["maresia"]),
  c("mossoro", "Mossoró", "RN", ["seco"]),
  c("parnamirim", "Parnamirim", "RN", ["maresia"]),
  c("caxias-do-sul", "Caxias do Sul", "RS", ["umido"]),
  c("canoas", "Canoas", "RS", ["umido"]),
  c("pelotas", "Pelotas", "RS", ["umido"]),
  c("santa-maria", "Santa Maria", "RS", ["umido"]),
  c("ji-parana", "Ji-Paraná", "RO", ["umido", "chuvoso"]),
  c("ariquemes", "Ariquemes", "RO", ["umido", "chuvoso"]),
  c("joinville", "Joinville", "SC", ["umido", "chuvoso"]),
  c("blumenau", "Blumenau", "SC", ["umido", "chuvoso"]),
  c("sao-jose", "São José", "SC", ["umido", "maresia"]),
  c("itajai", "Itajaí", "SC", ["umido", "maresia"]),
  c("chapeco", "Chapecó", "SC", ["umido"]),
  c("criciuma", "Criciúma", "SC", ["umido"]),
  c("balneario-camboriu", "Balneário Camboriú", "SC", ["umido", "maresia"]),
  c("guarulhos", "Guarulhos", "SP", ["seco"]),
  c("campinas", "Campinas", "SP", ["seco"]),
  c("sao-bernardo-do-campo", "São Bernardo do Campo", "SP", ["seco"]),
  c("santo-andre", "Santo André", "SP", ["seco"]),
  c("osasco", "Osasco", "SP", ["seco"]),
  c("sorocaba", "Sorocaba", "SP", ["seco"]),
  c("ribeirao-preto", "Ribeirão Preto", "SP", ["seco"]),
  c("sao-jose-dos-campos", "São José dos Campos", "SP", ["seco"]),
  c("sao-jose-do-rio-preto", "São José do Rio Preto", "SP", ["seco"]),
  c("santos", "Santos", "SP", ["umido", "maresia"]),
  c("nossa-senhora-do-socorro", "Nossa Senhora do Socorro", "SE", ["umido"]),
  c("lagarto", "Lagarto", "SE", ["seco"]),
  c("itabaiana", "Itabaiana", "SE", ["seco"]),
  c("araguaina", "Araguaína", "TO", ["seco"]),
  c("gurupi", "Gurupi", "TO", ["seco"]),
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
