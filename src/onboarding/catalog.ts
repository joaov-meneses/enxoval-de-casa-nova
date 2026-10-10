import type { RoomKey } from "./types";

/**
 * Catálogo de itens para uma casa nova.
 *
 * Marcas (texto, uma letra cada):
 *  E essencial em qualquer clima     H peça de calor (essencial só em clima quente)
 *  F peça de frio (essencial só em clima frio; some em clima quente)
 *  P quantidade por pessoa           Q quantidade por quem dorme no quarto
 *  T duas toalhas por pessoa         C só para casal           S só quando não é casal
 *  K só casa                         A só apartamento ou studio
 *  X fora do studio                  O só studio
 *  N só Nordeste                     R só Rio Grande do Sul
 *  I precisa estar pronto na primeira noite
 *
 * Faixa de preço (1 a 4) serve apenas para a estimativa de referência do funil.
 * Nunca é gravada como preço do item.
 */
export interface CatalogEntry {
  room: RoomKey;
  name: string;
  tier: 1 | 2 | 3 | 4;
  flags: string;
}

const e = (
  room: RoomKey,
  name: string,
  tier: 1 | 2 | 3 | 4,
  flags = "",
): CatalogEntry => ({ room, name, tier, flags });

export const CATALOG: CatalogEntry[] = [
  // Quarto principal
  e("quarto", "Cama (estrutura ou box)", 4, "EI"),
  e("quarto", "Colchão", 4, "EI"),
  e("quarto", "Guarda-roupa", 4, "E"),
  e("quarto", "Jogo de cama {cama}", 3, "EI"),
  e("quarto", "Travesseiros", 2, "EQI"),
  e("quarto", "Protetor de colchão", 2, "E"),
  e("quarto", "Cortina blackout", 3, "EI"),
  e("quarto", "Cabides", 1, "E"),
  e("quarto", "Cesto de roupa suja", 1, "E"),
  e("quarto", "Manta leve", 2, "E"),
  e("quarto", "Edredom ou cobertor", 3, "F"),
  e("quarto", "Cobertor extra", 2, "F"),
  e("quarto", "Ventilador", 2, "H"),
  e("quarto", "Ar-condicionado", 4, "H"),
  e("quarto", "Mesa de cabeceira", 3, "Q"),
  e("quarto", "Abajur", 2, "Q"),
  e("quarto", "Espelho de corpo inteiro", 2, ""),
  e("quarto", "Tapete de quarto", 2, ""),
  e("quarto", "Organizadores de gaveta", 1, ""),
  e("quarto", "Sapateira", 2, ""),
  e("quarto", "Caixas organizadoras", 2, ""),
  e("quarto", "Penteadeira ou cômoda", 3, "X"),
  e("quarto", "Roupão", 2, "F"),

  // Quarto extra
  e("quartoExtra", "Cama de solteiro ou sofá-cama", 4, "E"),
  e("quartoExtra", "Colchão de solteiro", 4, "E"),
  e("quartoExtra", "Jogo de cama solteiro", 3, "E"),
  e("quartoExtra", "Travesseiro", 2, "E"),
  e("quartoExtra", "Cortina", 2, "E"),
  e("quartoExtra", "Cabides", 1, "E"),
  e("quartoExtra", "Guarda-roupa ou cômoda", 3, ""),
  e("quartoExtra", "Cobertor", 2, "F"),
  e("quartoExtra", "Ventilador", 2, "H"),
  e("quartoExtra", "Abajur", 2, ""),
  e("quartoExtra", "Cesto de roupa suja", 1, ""),

  // Banheiro
  e("banheiro", "Toalhas de banho", 2, "ETI"),
  e("banheiro", "Toalhas de rosto", 1, "ET"),
  e("banheiro", "Tapete de banheiro", 1, "EI"),
  e("banheiro", "Cortina de box", 2, "E"),
  e("banheiro", "Lixeira de banheiro", 1, "EI"),
  e("banheiro", "Porta-papel higiênico", 1, "EI"),
  e("banheiro", "Escova sanitária", 1, "E"),
  e("banheiro", "Saboneteira ou dispenser", 1, "E"),
  e("banheiro", "Porta-toalhas", 2, "E"),
  e("banheiro", "Porta-escovas de dente", 1, ""),
  e("banheiro", "Espelho", 2, ""),
  e("banheiro", "Armário ou gabinete", 3, ""),
  e("banheiro", "Organizador de bancada", 1, ""),
  e("banheiro", "Cestos organizadores", 2, ""),
  e("banheiro", "Toalha de lavabo", 1, ""),
  e("banheiro", "Ducha higiênica", 2, ""),
  e("banheiro", "Porta-cotonetes", 1, ""),

  // Cozinha
  e("cozinha", "Jogo de panelas", 3, "E"),
  e("cozinha", "Frigideira antiaderente", 2, "E"),
  e("cozinha", "Panela de pressão", 2, "E"),
  e("cozinha", "Pratos rasos", 2, "EPI"),
  e("cozinha", "Pratos fundos", 2, "EP"),
  e("cozinha", "Copos", 2, "EPI"),
  e("cozinha", "Talheres (garfo, faca e colher)", 2, "EPI"),
  e("cozinha", "Xícaras e canecas", 2, "P"),
  e("cozinha", "Facas de cozinha", 2, "E"),
  e("cozinha", "Tábua de corte", 1, "E"),
  e("cozinha", "Escorredor de louça", 2, "E"),
  e("cozinha", "Escorredor de macarrão", 1, "E"),
  e("cozinha", "Colheres e espátulas", 1, "E"),
  e("cozinha", "Concha e escumadeira", 1, "E"),
  e("cozinha", "Abridor de latas e garrafas", 1, "E"),
  e("cozinha", "Descascador de legumes", 1, "E"),
  e("cozinha", "Assadeira", 2, "E"),
  e("cozinha", "Potes herméticos", 2, "E"),
  e("cozinha", "Bacias e tigelas", 1, "E"),
  e("cozinha", "Panos de prato", 1, "EI"),
  e("cozinha", "Lixeira de cozinha", 2, "E"),
  e("cozinha", "Luvas térmicas", 1, "E"),
  e("cozinha", "Dispenser de detergente e esponja", 1, "E"),
  e("cozinha", "Ralador", 1, ""),
  e("cozinha", "Saladeira", 1, ""),
  e("cozinha", "Travessas", 2, ""),
  e("cozinha", "Potes de vidro com tampa", 2, ""),
  e("cozinha", "Peneira", 1, ""),
  e("cozinha", "Porta-temperos", 2, ""),
  e("cozinha", "Jarra de suco", 1, ""),
  e("cozinha", "Garrafa térmica", 2, ""),
  e("cozinha", "Chaleira", 2, ""),
  e("cozinha", "Coador de café", 1, ""),
  e("cozinha", "Forma de bolo", 1, ""),
  e("cozinha", "Forma retangular", 2, ""),
  e("cozinha", "Descanso de panela", 1, ""),
  e("cozinha", "Tapete de cozinha", 2, ""),
  e("cozinha", "Taças para os primeiros brindes", 2, "C"),
  e("cozinha", "Taças de vinho", 2, "PS"),
  e("cozinha", "Jogo de sobremesa", 2, ""),
  e("cozinha", "Fruteira", 2, ""),
  e("cozinha", "Organizador de talheres", 1, ""),
  e("cozinha", "Organizadores de geladeira", 2, ""),
  e("cozinha", "Tesoura de cozinha", 1, ""),
  e("cozinha", "Rolo de abrir massa", 1, ""),
  e("cozinha", "Cuscuzeira", 1, "N"),
  e("cozinha", "Kit chimarrão (cuia, bomba, térmica)", 2, "R"),

  // Eletrodomésticos
  e("eletro", "Geladeira", 4, "E"),
  e("eletro", "Fogão ou cooktop", 4, "E"),
  e("eletro", "Micro-ondas", 3, "E"),
  e("eletro", "Liquidificador", 2, "E"),
  e("eletro", "Cafeteira", 2, ""),
  e("eletro", "Air fryer", 3, ""),
  e("eletro", "Sanduicheira", 2, ""),
  e("eletro", "Batedeira", 3, ""),
  e("eletro", "Panela elétrica de arroz", 2, ""),
  e("eletro", "Purificador de água", 3, ""),
  e("eletro", "Processador de alimentos", 3, ""),
  e("eletro", "Chaleira elétrica", 2, ""),
  e("eletro", "Mixer", 2, ""),
  e("eletro", "Lava-louças", 4, "X"),
  e("eletro", "Coifa ou depurador", 3, "X"),

  // Área de serviço
  e("servico", "Máquina de lavar roupa", 4, "E"),
  e("servico", "Varal", 2, "E"),
  e("servico", "Balde", 1, "E"),
  e("servico", "Vassoura e pá", 1, "E"),
  e("servico", "Rodo", 1, "E"),
  e("servico", "Panos de chão", 1, "E"),
  e("servico", "Kit de limpeza (flanelas e esponjas)", 1, "EI"),
  e("servico", "Prendedores de roupa", 1, "E"),
  e("servico", "Ferro de passar", 2, "E"),
  e("servico", "Extensões e adaptadores de tomada", 1, "EI"),
  e("servico", "Kit de ferramentas básicas", 2, "E"),
  e("servico", "Cesto de roupa", 2, ""),
  e("servico", "Tábua de passar", 2, ""),
  e("servico", "Mop ou esfregão", 1, ""),
  e("servico", "Aspirador de pó", 3, ""),
  e("servico", "Escada doméstica", 3, ""),
  e("servico", "Lixeira grande", 2, ""),
  e("servico", "Armário multiuso", 3, ""),
  e("servico", "Desentupidor", 1, ""),
  e("servico", "Robô aspirador", 4, ""),
  e("servico", "Secadora de roupas", 4, ""),

  // Sala de Estar
  e("sala", "Sofá", 4, "E"),
  e("sala", "Televisão", 4, "E"),
  e("sala", "Rack ou painel de TV", 3, "E"),
  e("sala", "Mesa de jantar com cadeiras", 4, "EX"),
  e("sala", "Cortinas", 3, "E"),
  e("sala", "Luminária ou abajur", 2, "EI"),
  e("sala", "Ventilador de teto", 3, "H"),
  e("sala", "Ar-condicionado", 4, "H"),
  e("sala", "Manta para o sofá", 2, "F"),
  e("sala", "Mesa de centro", 3, ""),
  e("sala", "Tapete", 3, ""),
  e("sala", "Poltrona", 3, ""),
  e("sala", "Almofadas", 2, ""),
  e("sala", "Aparador", 3, "X"),
  e("sala", "Estante", 3, ""),
  e("sala", "Mesa lateral", 2, ""),
  e("sala", "Quadros e decoração", 2, ""),
  e("sala", "Porta-retratos", 1, ""),
  e("sala", "Porta-chaves", 1, ""),
  e("sala", "Plantas e vasos", 2, ""),
  e("sala", "Cestos organizadores", 2, ""),
  e("sala", "Mesa dobrável ou bancada de jantar", 3, "EO"),
  e("sala", "Biombo ou divisória", 2, "O"),
  e("sala", "Cabideiro", 2, "O"),
  e("sala", "Organizadores para baixo da cama", 2, "O"),

  // Varanda e área externa
  e("externa", "Capacho", 1, "E"),
  e("externa", "Mesa e cadeiras externas", 3, ""),
  e("externa", "Plantas e vasos", 2, ""),
  e("externa", "Iluminação aconchegante", 2, ""),
  e("externa", "Tapete externo", 2, ""),
  e("externa", "Cadeira ou rede de descanso", 3, ""),
  e("externa", "Mangueira", 2, "EK"),
  e("externa", "Vassoura de quintal", 1, "K"),
  e("externa", "Lixeiras externas", 2, "K"),
  e("externa", "Kit churrasco", 3, "K"),
  e("externa", "Iluminação externa", 2, "K"),
  e("externa", "Borrifador e regador", 1, "A"),

  // Home office
  e("escritorio", "Mesa de trabalho", 3, "E"),
  e("escritorio", "Cadeira ergonômica", 3, "E"),
  e("escritorio", "Luminária de mesa", 2, "E"),
  e("escritorio", "Filtro de linha", 1, "E"),
  e("escritorio", "Monitor ou suporte para notebook", 3, ""),
  e("escritorio", "Gaveteiro", 3, ""),
  e("escritorio", "Estante ou prateleiras", 3, ""),
  e("escritorio", "Organizadores de mesa", 1, ""),
  e("escritorio", "Apoio para os pés", 2, ""),
  e("escritorio", "Organizadores de cabos", 1, ""),
];
