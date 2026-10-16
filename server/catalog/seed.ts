/**
 * Semente do catálogo mestre: o catálogo do funil (`src/onboarding/catalog.ts`) mais uma lista curada de itens
 * comuns de casa nova, apelidos ("air fryer", "fritadeira elétrica") e grupos de função (o que repete o trabalho
 * de outro item). Tudo nasce com `source = curated` e `status = approved`.
 *
 * Os itens que as pessoas cadastram e o Jev descobre entram depois, pela cascata e pela rotina do catálogo
 * (ver `server/catalog/store.ts` e `server/workers/catalogWorker.ts`). Para acrescentar itens, crie uma leva nova
 * (como `seed-v2.ts`) e suba `CATALOG_SEED_VERSION`: um banco já semeado recebe só os itens das levas mais novas que a
 * dele, para não ressuscitar o que a equipe apagou ou mesclou no /admin.
 */
import { itemKey } from '../../src/catalog/normalize.ts';
import { CATALOG } from '../../src/onboarding/catalog.ts';
import type { RoomKey } from '../../src/onboarding/types.ts';
import type { ItemPriority, ItemTiming } from '../../src/planning/purchasePlan.ts';
import { SEED_V2 } from './seed-v2.ts';

export const CATALOG_SEED_VERSION = 2;

export interface SeedItem {
  /** Versão da semente em que o item entrou. */
  since: number;
  name: string;
  room: RoomKey;
  priority: ItemPriority;
  timing: ItemTiming | null;
  leadTimeWeeks: number;
  priceCategory: 1 | 2 | 3 | 4;
  functionGroup: string | null;
  aliases: string[];
}

/** [ambiente, nome, faixa de preço, marcas (E essencial, I primeira noite, U primeira semana), apelidos, semanas de entrega] */
type Row = [RoomKey, string, 1 | 2 | 3 | 4, string, string[]?, number?];

const EXTRA: Row[] = [
  // Cozinha
  ['cozinha', 'Jogo de jantar', 3, 'E', ['aparelho de jantar', 'jogo de pratos']],
  ['cozinha', 'Jogo de copos', 2, '', ['kit de copos']],
  ['cozinha', 'Pratos de sobremesa', 2, ''],
  ['cozinha', 'Tigelas de sopa', 1, '', ['cumbuca', 'bowl']],
  ['cozinha', 'Pires', 1, ''],
  ['cozinha', 'Canecas', 1, '', ['caneca de cafe']],
  ['cozinha', 'Jogo de facas', 2, '', ['faqueiro de facas']],
  ['cozinha', 'Faqueiro', 2, '', ['jogo de talheres', 'faqueiro inox']],
  ['cozinha', 'Faca de pão', 1, ''],
  ['cozinha', 'Afiador de facas', 1, '', ['amolador de facas', 'chaira']],
  ['cozinha', 'Panela de arroz', 2, '', ['panela para arroz']],
  ['cozinha', 'Leiteira', 1, '', ['fervedor']],
  ['cozinha', 'Frigideira de ferro', 2, ''],
  ['cozinha', 'Wok', 2, ''],
  ['cozinha', 'Chapa para grelhar', 2, '', ['bifeteira', 'grill de fogão']],
  ['cozinha', 'Cuscuzeira de alumínio', 1, ''],
  ['cozinha', 'Panela de fondue', 2, '', ['kit fondue']],
  ['cozinha', 'Forma de pizza', 1, '', ['assadeira de pizza']],
  ['cozinha', 'Forma de pudim', 1, ''],
  ['cozinha', 'Forma de cupcake', 1, '', ['forma de muffin']],
  ['cozinha', 'Refratário de vidro', 2, '', ['travessa de vidro', 'pirex']],
  ['cozinha', 'Escorredor de arroz', 1, ''],
  ['cozinha', 'Espátula de silicone', 1, '', ['pão-duro']],
  ['cozinha', 'Batedor de arame', 1, '', ['fouet']],
  ['cozinha', 'Pegador de massa', 1, ''],
  ['cozinha', 'Colher de pau', 1, ''],
  ['cozinha', 'Amassador de batatas', 1, ''],
  ['cozinha', 'Espremedor de alho', 1, ''],
  ['cozinha', 'Pilão', 1, '', ['socador de alho']],
  ['cozinha', 'Moedor de pimenta', 1, ''],
  ['cozinha', 'Saleiro', 1, ''],
  ['cozinha', 'Açucareiro', 1, ''],
  ['cozinha', 'Manteigueira', 1, ''],
  ['cozinha', 'Porta-frios', 1, ''],
  ['cozinha', 'Boleira', 2, '', ['porta-bolo']],
  ['cozinha', 'Bandeja de servir', 2, '', ['bandeja']],
  ['cozinha', 'Porta-guardanapos', 1, ''],
  ['cozinha', 'Guardanapos de pano', 1, ''],
  ['cozinha', 'Toalha de mesa', 2, ''],
  ['cozinha', 'Caminho de mesa', 1, ''],
  ['cozinha', 'Porta-pão', 1, ''],
  ['cozinha', 'Porta-mantimentos', 2, '', ['potes de mantimentos']],
  ['cozinha', 'Organizador de armário de cozinha', 1, ''],
  ['cozinha', 'Suporte para papel-toalha', 1, '', ['porta papel toalha']],
  ['cozinha', 'Lixeira de pia', 1, ''],
  ['cozinha', 'Escova de lavar louça', 1, ''],
  ['cozinha', 'Garrafa de café', 1, ''],
  ['cozinha', 'Bule', 1, ''],
  ['cozinha', 'Cafeteira italiana', 2, '', ['moka']],
  ['cozinha', 'Prensa francesa', 2, '', ['french press']],
  ['cozinha', 'Suporte de filtro de café', 1, '', ['porta-filtro de cafe']],
  ['cozinha', 'Moedor de café manual', 2, ''],
  ['cozinha', 'Infusor de chá', 1, ''],
  ['cozinha', 'Coqueteleira', 1, ''],
  ['cozinha', 'Abridor de vinho', 1, '', ['saca-rolhas']],
  ['cozinha', 'Balde de gelo', 1, ''],
  ['cozinha', 'Formas de gelo', 1, '', ['forma de gelo']],
  ['cozinha', 'Jarra de água', 1, ''],
  ['cozinha', 'Filtro de barro', 2, '', ['filtro de agua de barro']],
  ['cozinha', 'Galão de água com suporte', 2, '', ['suporte de galao']],
  ['cozinha', 'Lancheira térmica', 2, ''],
  ['cozinha', 'Squeeze', 1, ''],
  ['cozinha', 'Mangueira de gás', 1, 'E', ['mangueira para gas']],
  ['cozinha', 'Regulador de gás', 1, 'E', ['registro de gas']],
  ['cozinha', 'Botijão de gás', 3, 'E', ['bujao de gas', 'botijao']],
  ['cozinha', 'Extintor de incêndio', 2, ''],
  ['cozinha', 'Banquetas', 3, '', ['banqueta alta']],
  ['cozinha', 'Mesa de cozinha', 3, ''],
  ['cozinha', 'Carrinho auxiliar', 2, '', ['carrinho de cozinha']],
  ['cozinha', 'Prateleira de cozinha', 2, ''],
  ['cozinha', 'Armário de cozinha', 4, '', ['armario aereo', 'cozinha planejada'], 4],
  ['cozinha', 'Paneleiro', 3, ''],
  ['cozinha', 'Fita veda-rosca', 1, ''],
  ['cozinha', 'Tampa de silicone', 1, ''],
  ['cozinha', 'Filme plástico', 1, '', ['plastico filme']],
  ['cozinha', 'Papel-alumínio', 1, ''],
  ['cozinha', 'Saco de lixo', 1, 'EI'],
  ['cozinha', 'Detergente e esponjas', 1, 'EI', ['esponja de louca']],

  // Eletroportáteis e eletrodomésticos
  ['eletro', 'Fritadeira elétrica', 3, ''],
  ['eletro', 'Forno micro-ondas com airfryer', 4, '', ['micro-ondas air fryer']],
  ['eletro', 'Grill elétrico', 2, '', ['grill', 'mini grill']],
  ['eletro', 'Pipoqueira elétrica', 2, ''],
  ['eletro', 'Cafeteira de cápsula', 3, '', ['maquina de capsula', 'cafeteira expresso de capsula']],
  ['eletro', 'Máquina de café expresso', 4, '', ['cafeteira expresso']],
  ['eletro', 'Moedor de café elétrico', 2, ''],
  ['eletro', 'Mixer de mão', 2, '', ['mixer 3 em 1']],
  ['eletro', 'Multiprocessador', 3, ''],
  ['eletro', 'Batedeira planetária', 4, ''],
  ['eletro', 'Panela elétrica multifuncional', 3, '', ['panela eletrica de pressao', 'multicooker']],
  ['eletro', 'Iogurteira', 2, ''],
  ['eletro', 'Máquina de pão', 3, ''],
  ['eletro', 'Waffleira', 2, ''],
  ['eletro', 'Crepeira', 2, ''],
  ['eletro', 'Fondue elétrico', 2, ''],
  ['eletro', 'Cooktop de indução', 4, '', ['cooktop inducao'], 2],
  ['eletro', 'Forno de embutir', 4, '', ['forno eletrico de embutir'], 2],
  ['eletro', 'Freezer', 4, '', ['freezer horizontal', 'freezer vertical'], 2],
  ['eletro', 'Frigobar', 3, ''],
  ['eletro', 'Adega climatizada', 4, ''],
  ['eletro', 'Bebedouro', 3, ''],
  ['eletro', 'Desidratador de alimentos', 3, ''],
  ['eletro', 'Seladora a vácuo', 2, ''],
  ['eletro', 'Balança digital de cozinha', 1, ''],
  ['eletro', 'Sorveteira', 2, ''],
  ['eletro', 'Chopeira', 3, ''],
  ['eletro', 'Fogão a gás', 4, 'E', ['fogao 4 bocas', 'fogao de piso'], 2],
  ['eletro', 'Refrigerador duplex', 4, '', ['geladeira duplex', 'geladeira frost free'], 2],

  // Sala
  ['sala', 'Sofá-cama', 4, '', ['sofa cama'], 4],
  ['sala', 'Sofá retrátil', 4, '', ['sofa retratil e reclinavel'], 4],
  ['sala', 'Chaise', 4, '', ['espreguicadeira'], 3],
  ['sala', 'Cadeiras de jantar', 3, '', ['cadeira de jantar'], 2],
  ['sala', 'Buffet', 3, '', ['bufe'], 2],
  ['sala', 'Cristaleira', 4, '', [], 2],
  ['sala', 'Painel de TV', 3, '', ['painel para tv'], 2],
  ['sala', 'Suporte de TV', 2, '', ['suporte articulado para tv']],
  ['sala', 'Home theater', 4, '', ['soundbar', 'caixa de som']],
  ['sala', 'Aparelho de streaming', 2, '', ['chromecast', 'fire tv stick', 'tv box']],
  ['sala', 'Roteador wi-fi', 2, 'E', ['roteador', 'repetidor wi-fi']],
  ['sala', 'Videogame', 4, ''],
  ['sala', 'Puff baú', 2, ''],
  ['sala', 'Nicho decorativo', 1, '', ['nicho']],
  ['sala', 'Prateleiras', 1, '', ['prateleira']],
  ['sala', 'Lustre ou pendente', 3, '', ['pendente', 'lustre', 'plafon']],
  ['sala', 'Luminária de chão', 2, '', ['luminaria de piso', 'abajur de chao']],
  ['sala', 'Cortina de voil', 2, ''],
  ['sala', 'Varão de cortina', 1, '', ['varao', 'trilho de cortina']],
  ['sala', 'Persiana', 3, '', ['persiana rolo'], 2],
  ['sala', 'Capa de sofá', 2, '', ['protetor de sofa']],
  ['sala', 'Vaso decorativo', 1, ''],
  ['sala', 'Velas aromáticas', 1, '', ['vela perfumada']],
  ['sala', 'Difusor de aromas', 1, '', ['aromatizador', 'difusor de varetas']],
  ['sala', 'Livros de decoração', 1, ''],
  ['sala', 'Bandeja decorativa', 1, ''],
  ['sala', 'Escrivaninha', 3, '', ['mesa de estudo']],
  ['sala', 'Revisteiro', 1, ''],
  ['sala', 'Bar ou carrinho de bebidas', 3, '', ['carrinho bar']],
  ['sala', 'Purificador de ar', 3, ''],

  // Quarto
  ['quarto', 'Cama box', 4, 'EI', ['box casal', 'cama box casal', 'base box'], 3],
  ['quarto', 'Cabeceira', 3, '', ['cabeceira estofada'], 2],
  ['quarto', 'Bicama', 4, '', [], 3],
  ['quarto', 'Beliche', 4, '', [], 3],
  ['quarto', 'Cômoda', 3, '', ['comoda com gavetas'], 2],
  ['quarto', 'Criado-mudo', 2, '', ['mesa de cabeceira'], 1],
  ['quarto', 'Closet modular', 4, '', ['closet'], 3],
  ['quarto', 'Lençol com elástico', 2, '', ['lencol']],
  ['quarto', 'Fronhas', 1, '', ['fronha']],
  ['quarto', 'Edredom', 3, '', ['duvet']],
  ['quarto', 'Cobertor de microfibra', 2, ''],
  ['quarto', 'Colcha', 2, '', ['cobre leito']],
  ['quarto', 'Saia para cama box', 2, '', ['saia box']],
  ['quarto', 'Pillow top', 3, '', ['pillowtop']],
  ['quarto', 'Travesseiro de corpo', 2, '', ['travesseiro xuxao']],
  ['quarto', 'Almofadas decorativas', 2, ''],
  ['quarto', 'Cortina de tecido', 2, '', ['cortina']],
  ['quarto', 'Persiana blackout', 3, '', ['persiana para quarto']],
  ['quarto', 'Luminária de cabeceira', 2, ''],
  ['quarto', 'Despertador', 1, '', ['relogio despertador']],
  ['quarto', 'Cabideiro de pé', 2, ''],
  ['quarto', 'Porta-joias', 1, '', ['caixa de joias']],
  ['quarto', 'Organizador de sapatos', 1, ''],
  ['quarto', 'Sacos a vácuo', 1, '', ['saco a vacuo para roupas']],
  ['quarto', 'Cabides de veludo', 1, ''],
  ['quarto', 'Tapete de pé de cama', 2, '', ['passadeira']],
  ['quarto', 'Climatizador de ar', 3, '', ['climatizador']],
  ['quarto', 'Ventilador de coluna', 2, ''],
  ['quarto', 'Aquecedor a óleo', 3, ''],
  ['quarto', 'Cobertor elétrico', 2, '', ['manta termica']],
  ['quarto', 'Escrivaninha de quarto', 3, ''],
  ['quarto', 'Berço', 4, '', [], 3],

  // Banheiro
  ['banheiro', 'Box de vidro', 4, 'E', ['box blindex', 'box para banheiro'], 3],
  ['banheiro', 'Chuveiro elétrico', 2, 'EI', ['chuveiro', 'ducha eletrica']],
  ['banheiro', 'Ducha', 3, '', ['ducha de teto', 'chuveiro a gas']],
  ['banheiro', 'Armário de espelho', 3, '', ['espelheira', 'armario com espelho']],
  ['banheiro', 'Gabinete de banheiro', 3, '', ['gabinete com cuba'], 2],
  ['banheiro', 'Assento sanitário', 2, 'E', ['tampa de vaso', 'assento de vaso']],
  ['banheiro', 'Toalhas de piso', 1, '', ['toalha de chao']],
  ['banheiro', 'Roupões de banho', 2, ''],
  ['banheiro', 'Toalhas de banho extras', 2, '', ['toalha de visita']],
  ['banheiro', 'Kit banheiro', 2, '', ['kit de acessorios para banheiro']],
  ['banheiro', 'Porta-sabonete líquido', 1, '', ['dispenser de sabonete', 'saboneteira liquida']],
  ['banheiro', 'Toalheiro de parede', 1, '', ['toalheiro']],
  ['banheiro', 'Toalheiro térmico', 3, ''],
  ['banheiro', 'Ganchos e cabides de porta', 1, '', ['gancho de porta']],
  ['banheiro', 'Nicho para box', 1, '', ['cantoneira de box']],
  ['banheiro', 'Banquinho para banho', 1, ''],
  ['banheiro', 'Barra de apoio', 2, ''],
  ['banheiro', 'Prancha de cabelo', 2, '', ['chapinha']],
  ['banheiro', 'Modelador de cachos', 2, '', ['babyliss']],
  ['banheiro', 'Barbeador elétrico', 2, '', ['aparador de barba', 'maquina de cortar cabelo']],
  ['banheiro', 'Escova de dente elétrica', 2, ''],
  ['banheiro', 'Lixeira com pedal', 1, ''],
  ['banheiro', 'Desentupidor de vaso', 1, ''],
  ['banheiro', 'Papel higiênico', 1, 'EI'],
  ['banheiro', 'Aquecedor de água', 4, '', ['aquecedor a gas', 'boiler'], 3],

  // Área de serviço e limpeza
  ['servico', 'Lava e seca', 4, '', ['lava-seca', 'lava e seca roupas'], 2],
  ['servico', 'Tanquinho', 3, '', ['tanquinho de lavar']],
  ['servico', 'Centrífuga de roupas', 2, '', ['centrifuga']],
  ['servico', 'Tanque', 3, '', ['tanque de lavar roupa'], 2],
  ['servico', 'Varal de teto', 2, '', ['varal de teto retratil']],
  ['servico', 'Varal de chão', 1, '', ['varal de piso', 'varal de abas']],
  ['servico', 'Varal de parede', 1, '', ['varal sanfonado']],
  ['servico', 'Ferro a vapor', 2, '', ['ferro de passar a vapor']],
  ['servico', 'Vaporizador de roupas', 2, '', ['passadeira a vapor', 'steamer']],
  ['servico', 'Aspirador vertical', 3, '', ['aspirador de po vertical', 'aspirador portatil']],
  ['servico', 'Aspirador sem fio', 3, ''],
  ['servico', 'Lavadora de alta pressão', 3, '', ['lava jato', 'wap']],
  ['servico', 'Vassoura mágica', 1, '', ['mop giratorio', 'mop spray']],
  ['servico', 'Pá de lixo', 1, '', ['pa coletora']],
  ['servico', 'Espanador', 1, ''],
  ['servico', 'Escova de limpeza', 1, ''],
  ['servico', 'Luvas de limpeza', 1, '', ['luva de borracha']],
  ['servico', 'Cesto para roupa limpa', 1, ''],
  ['servico', 'Sacos para lavar roupa', 1, '', ['saco protetor para maquina']],
  ['servico', 'Organizador de produtos de limpeza', 1, ''],
  ['servico', 'Produtos de limpeza', 1, 'EI', ['kit de produtos de limpeza', 'desinfetante', 'agua sanitaria']],
  ['servico', 'Sabão em pó', 1, 'E', ['sabao liquido', 'lava roupas']],
  ['servico', 'Amaciante', 1, ''],
  ['servico', 'Furadeira', 3, '', ['parafusadeira', 'furadeira de impacto']],
  ['servico', 'Trena', 1, ''],
  ['servico', 'Nível de bolha', 1, ''],
  ['servico', 'Lâmpadas', 1, 'EI', ['lampada led']],
  ['servico', 'Buchas e parafusos', 1, ''],
  ['servico', 'Fita isolante', 1, ''],
  ['servico', 'Chave de fenda e philips', 1, ''],
  ['servico', 'Alicate', 1, ''],
  ['servico', 'Martelo', 1, ''],
  ['servico', 'Carrinho de feira', 2, ''],
  ['servico', 'Sacolas retornáveis', 1, '', ['ecobag']],
  ['servico', 'Fechadura digital', 3, '', ['fechadura eletronica']],
  ['servico', 'Câmera de segurança', 2, '', ['camera wi-fi']],
  ['servico', 'Olho mágico digital', 2, ''],
  ['servico', 'Tela de proteção para janelas', 3, '', ['rede de protecao'], 2],
  ['servico', 'Detector de fumaça', 1, ''],

  // Escritório
  ['escritorio', 'Cadeira de escritório', 3, '', ['cadeira giratoria', 'cadeira gamer']],
  ['escritorio', 'Mesa para computador', 3, ''],
  ['escritorio', 'Mesa regulável', 4, '', ['mesa com regulagem de altura', 'standing desk'], 2],
  ['escritorio', 'Suporte para notebook', 1, ''],
  ['escritorio', 'Teclado e mouse', 2, '', ['teclado', 'mouse']],
  ['escritorio', 'Webcam', 2, ''],
  ['escritorio', 'Impressora', 3, '', ['multifuncional']],
  ['escritorio', 'Mousepad', 1, ''],
  ['escritorio', 'Hub USB', 1, ''],
  ['escritorio', 'Armário de escritório', 3, ''],
  ['escritorio', 'Ring light', 2, ''],

  // Varanda e área externa
  ['externa', 'Churrasqueira a carvão', 3, '', ['churrasqueira']],
  ['externa', 'Churrasqueira elétrica', 3, ''],
  ['externa', 'Espreguiçadeira', 3, ''],
  ['externa', 'Rede de descanso', 2, '', ['rede']],
  ['externa', 'Cadeira de balanço', 3, ''],
  ['externa', 'Floreira', 1, ''],
  ['externa', 'Horta vertical', 2, '', ['jardim vertical']],
  ['externa', 'Kit de jardinagem', 1, '', ['ferramentas de jardim']],
  ['externa', 'Cortador de grama', 3, ''],
  ['externa', 'Tela para varanda', 3, '', ['rede de protecao para varanda'], 2],
  ['externa', 'Cooler', 2, '', ['caixa termica']],
  ['externa', 'Bicicletário', 2, '', ['suporte de bicicleta']],
];

/**
 * Grupos de função: itens do mesmo grupo fazem o mesmo trabalho. O aviso de compra redundante vira uma consulta ao
 * banco ("já existe item deste grupo na lista?"). Os grupos são estreitos de propósito: só o que de fato substitui.
 */
const FUNCTION_GROUPS: Record<string, string[]> = {
  'fritura-sem-oleo': ['Air fryer', 'Fritadeira elétrica', 'Forno micro-ondas com airfryer'],
  'aquecer-agua': ['Chaleira elétrica', 'Chaleira'],
  'cafe-expresso': ['Cafeteira de cápsula', 'Máquina de café expresso'],
  'cafe-coado': ['Cafeteira', 'Coador de pano para café', 'Suporte de filtro de café'],
  'passar-roupa': ['Ferro de passar', 'Ferro a vapor', 'Vaporizador de roupas'],
  'aspirar-po': ['Aspirador de pó', 'Aspirador vertical', 'Aspirador sem fio'],
  'lavar-roupa': ['Máquina de lavar roupa', 'Lava e seca', 'Tanquinho'],
  'pipoca': ['Pipoqueira', 'Pipoqueira elétrica'],
  'grelhar-lanche': ['Sanduicheira', 'Grill elétrico'],
  'cozinhar-arroz': ['Panela elétrica de arroz', 'Panela elétrica multifuncional'],
  'espremer-frutas': ['Espremedor de frutas', 'Espremedor elétrico de frutas'],
  'triturar-mao': ['Mixer', 'Mixer de mão'],
  'processar-alimentos': ['Processador de alimentos', 'Multiprocessador'],
  'bater-massa': ['Batedeira', 'Batedeira planetária'],
  'cama-casal': ['Cama (estrutura ou box)', 'Cama box'],
  'cama-hospede': ['Cama de solteiro ou sofá-cama', 'Bicama', 'Sofá-cama'],
  'agua-filtrada': ['Filtro de água de bancada', 'Purificador de água', 'Filtro de barro'],
  'resfriar-ambiente': ['Ar-condicionado', 'Climatizador de ar'],
  'aquecer-ambiente': ['Aquecedor de ambiente', 'Aquecedor a óleo'],
  'cozinhar-fogo': ['Fogão ou cooktop', 'Fogão a gás', 'Cooktop de indução'],
  'refrigerar': ['Geladeira', 'Refrigerador duplex'],
  'gabinete-banheiro': ['Armário ou gabinete', 'Gabinete de banheiro'],
  'mesa-cabeceira': ['Mesa de cabeceira', 'Criado-mudo'],
};

/** Apelidos dos itens que vêm do funil (os da lista curada trazem os seus). */
const FUNNEL_ALIASES: Record<string, string[]> = {
  'Air fryer': ['airfryer', 'fritadeira sem oleo', 'fritadeira eletrica sem oleo'],
  Geladeira: ['refrigerador'],
  'Fogão ou cooktop': ['fogao', 'cooktop'],
  'Micro-ondas': ['microondas', 'forno micro-ondas', 'forno de micro-ondas'],
  'Máquina de lavar roupa': ['maquina de lavar', 'lavadora', 'lavadora de roupas'],
  'Cama (estrutura ou box)': ['cama', 'estrutura de cama'],
  'Jogo de cama': ['roupa de cama', 'jogo de lencol', 'jogo de lencois'],
  'Jogo de cama reserva': ['roupa de cama reserva'],
  'Rack ou painel de TV': ['rack', 'rack para tv'],
  Televisão: ['tv', 'smart tv', 'televisor'],
  'Talheres (garfo, faca e colher)': ['talheres', 'jogo de talheres'],
  'Toalhas de banho': ['toalha de banho', 'jogo de toalhas'],
  'Guarda-roupa': ['guarda roupa', 'roupeiro', 'armario de quarto'],
  'Penteadeira ou cômoda': ['penteadeira'],
  'Lava-louças': ['lava loucas', 'maquina de lavar louca'],
  'Escorredor de louça': ['escorredor de pratos', 'secador de louca'],
  'Cortina blackout': ['blackout'],
  'Ar-condicionado': ['ar condicionado', 'split'],
  'Vassoura e pá': ['vassoura'],
  'Mop ou esfregão': ['mop', 'esfregao'],
  'Kit de primeiros socorros': ['caixa de primeiros socorros'],
  'Extensões e adaptadores de tomada': ['extensao', 'benjamim', 'adaptador de tomada'],
  'Potes herméticos': ['potes', 'potes de plastico'],
  'Panos de prato': ['pano de prato'],
  'Tábua de corte': ['tabua de carne'],
  'Liquidificador': ['liquidificador de alta potencia'],
  'Filtro de linha': ['regua de tomadas'],
};

/** Prazo padrão pela faixa de preço: o que é grande e caro costuma ter entrega agendada e montagem. */
const LEAD_TIME_BY_TIER: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 1, 4: 3 };

/** Semanas de entrega e montagem conhecidas dos itens do funil (móveis planejados e sob encomenda demoram mais). */
const FUNNEL_LEAD_TIME: Record<string, number> = {
  'Cama (estrutura ou box)': 3,
  Colchão: 2,
  'Guarda-roupa': 6,
  Sofá: 6,
  Geladeira: 2,
  'Fogão ou cooktop': 2,
  'Máquina de lavar roupa': 2,
  'Rack ou painel de TV': 3,
  'Mesa de jantar com cadeiras': 6,
  'Ar-condicionado': 3,
  'Lava-louças': 3,
};

function toSeed(name: string, room: RoomKey, tier: 1 | 2 | 3 | 4, flags: string, aliases: string[], lead?: number, since = 1): SeedItem {
  return {
    since,
    name,
    room,
    priority: flags.includes('E') ? 'essential' : 'optional',
    timing: flags.includes('I') ? 'first_night' : flags.includes('U') ? 'first_week' : null,
    leadTimeWeeks: lead ?? FUNNEL_LEAD_TIME[name] ?? LEAD_TIME_BY_TIER[tier],
    priceCategory: tier,
    functionGroup: null,
    aliases,
  };
}

/** Lê uma linha compacta das levas novas: "Nome|faixa|marcas|apelido1;apelido2|semanas". */
export function parseRow(row: string) {
  const [name, tierText, flags = '', aliasText = '', leadText = ''] = row.split('|').map(part => part.trim());
  const tier = Number(tierText);
  if (!name || !(tier === 1 || tier === 2 || tier === 3 || tier === 4)) return null;
  const lead = leadText ? Number(leadText) : undefined;
  return {
    name,
    tier: tier as 1 | 2 | 3 | 4,
    flags,
    aliases: aliasText ? aliasText.split(';').map(alias => alias.trim()).filter(Boolean) : [],
    lead: lead !== undefined && Number.isInteger(lead) && lead >= 0 ? lead : undefined,
  };
}

/** Todos os itens da semente, sem nomes repetidos (o primeiro vence: o funil, depois as levas em ordem). */
export function seedItems(): SeedItem[] {
  const byName = new Map<string, SeedItem>();
  for (const entry of CATALOG) {
    const name = entry.name.replace(/\s*\{cama\}/, '');
    if (byName.has(name)) continue;
    // Itens de calor (H) e de frio (F) são essenciais só em alguns climas: o catálogo os guarda como opcionais e
    // a urgência por faixa de perfil (que inclui o clima) faz o resto.
    byName.set(name, toSeed(name, entry.room, entry.tier, entry.flags, FUNNEL_ALIASES[name] ?? []));
  }
  for (const [room, name, tier, flags, aliases, lead] of EXTRA) {
    if (!byName.has(name)) byName.set(name, toSeed(name, room, tier, flags, aliases ?? [], lead));
  }
  for (const [room, rows] of Object.entries(SEED_V2) as [RoomKey, string[]][]) {
    for (const row of rows) {
      const parsed = parseRow(row);
      if (parsed && !byName.has(parsed.name)) {
        byName.set(parsed.name, toSeed(parsed.name, room, parsed.tier, parsed.flags, parsed.aliases, parsed.lead, 2));
      }
    }
  }
  for (const [group, names] of Object.entries(FUNCTION_GROUPS)) {
    for (const name of names) {
      const item = byName.get(name);
      if (item) item.functionGroup = group;
    }
  }
  // Nomes diferentes com a mesma chave ("Travesseiros" e "Travesseiro") são o mesmo item, e um item novo cuja chave já
  // é apelido de outro também: o segundo vira apelido do primeiro. Assim um banco novo e um já semeado com uma leva
  // antiga chegam ao mesmo catálogo.
  const owner = new Map<string, SeedItem>();
  const accepted: SeedItem[] = [];
  for (const item of byName.values()) {
    const key = itemKey(item.name);
    const first = owner.get(key);
    if (first) {
      first.aliases.push(item.name, ...item.aliases);
      continue;
    }
    accepted.push(item);
    owner.set(key, item);
    for (const alias of item.aliases) {
      const aliasKey = itemKey(alias);
      if (aliasKey && !owner.has(aliasKey)) owner.set(aliasKey, item);
    }
  }
  return accepted;
}

/** Grupos de função conhecidos, para o Jev escolher um ao criar um item novo. */
export const KNOWN_FUNCTION_GROUPS = Object.keys(FUNCTION_GROUPS);
