import type { ItemStatus } from './itemStatus';
import type { PriceCategory, SpendingTier } from './planning/spending';
import type { CatalogItemMeta, ItemPriority, ItemTiming } from './planning/purchasePlan';
import type { RoomKey } from './onboarding/types';
import type { AccountPlan } from './plans';

/** Item do catálogo mestre devolvido pela busca rápida (autocomplete). */
export interface CatalogSearchResult {
  id: string;
  name: string;
  room: RoomKey | null;
  /** Faixa comum de preço, em centavos, quando há amostra suficiente (p10, mediana e p90). */
  priceRange: { p10: number; p50: number; p90: number; samples: number; region: string } | null;
}

/**
 * Item do catálogo reconhecido num nome da planilha. exact: é o próprio item · similar: quase igual, provável erro de
 * digitação · contained: uma variação dele ("Jogo de cama casal 4 peças"), e só o cômodo vale.
 */
export interface CatalogNameMatch {
  match: "exact" | "similar" | "contained";
  id: string;
  name: string;
  room: RoomKey | null;
}

/** Item do catálogo mestre como o /admin vê: com apelidos, origem e quantos itens de enxovais usam. */
export interface AdminCatalogItem {
  id: string;
  slug: string;
  name: string;
  normalizedName: string;
  room: RoomKey | null;
  priority: ItemPriority | null;
  timing: ItemTiming | null;
  leadTimeWeeks: number;
  priceCategory: 1 | 2 | 3 | 4 | null;
  functionGroup: string | null;
  source: "curated" | "users" | "jev";
  status: "approved" | "pending_review";
  createdAt: string;
  aliases: { alias: string; key: string; source: string }[];
  usage: number;
}

export interface AdminCatalogOverview {
  days: number;
  daily: { day: string; metric: string; count: number }[];
  totals: Record<string, number>;
  /** Parte das resoluções de item atendidas pelo catálogo, sem Jev (0 a 1). */
  hitRate: number | null;
  /** Parte das notas de urgência atendidas pelo catálogo, sem Jev (0 a 1). */
  urgencyHitRate: number | null;
  jevCalls: number;
  activeUsers: number;
  jevCallsPerActiveUser: number | null;
  catalog: { status: string; source: string; total: number }[];
  gaps: { unlinked: number; linked: number; without_urgency: number; aliases: number; price_ranges: number };
}

export type { ItemStatus };
export type Category = string;
export type EnxovalRole = 'owner' | 'editor';

export interface EnxovalSummary {
  id: string;
  name: string;
  ownerId: string;
  /** Nome de quem é dono. Em enxovais compartilhados (`role: 'editor'`) mostra de quem é a lista. */
  ownerName: string;
  /** `owner`: enxoval da própria pessoa. `editor`: enxoval de outra pessoa, ao qual ela foi convidada. */
  role: EnxovalRole;
  discountCents: number;
  /** AAAA-MM-DD da mudança, ou null quando ainda não se sabe. */
  moveDate: string | null;
  /** UF e cidade (id de `onboarding/regions.ts`) da casa nova; a cidade é opcional. */
  state: string | null;
  city: string | null;
  /** Perfil de gasto: define as faixas de referência de cada item e de cada período de compra. */
  spendingTier: SpendingTier;
  /** Teto mensal que o casal quer respeitar nas parcelas (opcional, só o dono edita). */
  monthlyBudgetCents?: number | null;
}

export interface EnxovalMember {
  id: string;
  name: string;
  email: string;
  role: EnxovalRole;
  /** Foto do perfil, servida só para quem participa do mesmo enxoval. */
  avatarUrl?: string | null;
}

export interface EnxovalInvitation {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

export interface InvitationPreview {
  valid: boolean;
  email?: string;
  enxovalName?: string;
  inviterName?: string;
  /** Já existe conta com o e-mail do convite: é preciso entrar nela, em vez de criar uma senha. */
  accountExists?: boolean;
}

export interface EnxovalCategory {
  id: string;
  name: string;
  sortOrder: number;
}

/** Qual preço do produto o item acompanha: o normal (parcelado) ou o à vista no Pix. */
export type PriceBasis = 'regular' | 'pix';

/** Resultado da última leitura do produto: `blocked` quando o site barrou a leitura automática. */
export type TrackingStatus = 'pending' | 'ok' | 'no_price' | 'blocked' | 'failed';

/** Acompanhamento de preço de um item cadastrado a partir do link de uma loja. */
export interface ItemPriceTracking {
  /** Endereço da loja (sem "www."), por exemplo `mercadolivre.com.br`. */
  domain: string;
  url: string;
  /** Preço no dia do cadastro: é a referência para dizer se ficou mais barato ou mais caro. */
  initialPriceCents: number | null;
  targetPriceCents: number | null;
  priceAlertEnabled: boolean;
  priceBasis: PriceBasis;
  /** Último preço lido na loja (no Pix ou normal, conforme `priceBasis`). */
  currentPriceCents: number | null;
  /** Menor preço visto nos últimos 60 dias. */
  lowestPriceCents60d: number | null;
  /** O preço atual é o menor dos últimos 60 dias (e já foi mais alto nesse período). */
  isLowestIn60d: boolean;
  inStock: boolean;
  lastCheckedAt: string | null;
  status: TrackingStatus;
}

/** Campos opcionais para criar ou editar um item ligado ao link de uma loja. */
export interface ItemTrackingInput {
  trackedProductUrl?: string | null;
  initialPriceCents?: number | null;
  targetPriceCents?: number | null;
  selectedVariation?: string | null;
  priceBasis?: PriceBasis;
  priceAlertEnabled?: boolean;
}

/** Campos da Fase 11 que o item aceita ao salvar. `thanked` marca (ou desmarca) o agradecimento como enviado. */
export interface ItemExtrasInput {
  installments?: number;
  firstInstallmentOn?: string | null;
  purchasedAt?: string | null;
  paymentMethod?: PaymentMethod | null;
  installmentCents?: number | null;
  assigneeId?: string | null;
  giftFrom?: string | null;
  giftMessage?: string | null;
  thanked?: boolean;
  warrantyMonths?: number | null;
  warrantyUntil?: string | null;
  storeName?: string | null;
}

/** Dados lidos do link de um produto, para preencher o formulário. */
export interface ScrapedProductPreview {
  url: string;
  canonicalUrl?: string;
  domain: string;
  title: string;
  imageUrl?: string;
  priceCents: number | null;
  pixPriceCents?: number | null;
  currency: string;
  inStock: boolean;
  variations?: {
    voltage?: ('110V' | '127V' | '220V' | 'Bivolt')[];
    colors?: string[];
  };
  /** Ambiente sugerido pelo nome do produto: Cozinha, Quarto, Banheiro, Sala ou Área de Serviço. */
  suggestedCategory?: string;
  /** Cômodo do item do catálogo achado no título do produto (vale mais que `suggestedCategory`). */
  suggestedRoom?: RoomKey | null;
  /** A loja não deixou ler a página: só o nome (tirado do próprio link) é confiável; preço e foto ficam por conta da pessoa. */
  partial?: boolean;
}

export interface PriceHistoryPoint {
  date: string;
  priceCents: number;
  pixPriceCents?: number;
}

export interface ItemPriceHistory {
  points: PriceHistoryPoint[];
  initialPriceCents: number | null;
  targetPriceCents: number | null;
  priceBasis: PriceBasis;
  url: string;
  domain: string;
  /** Histórico das outras lojas do item, para o gráfico mostrar uma linha por loja. */
  offers?: { domain: string; url: string; points: { date: string; priceCents: number }[] }[];
}

export interface SavingsSummary {
  /** Itens a comprar que têm preço de cadastro e preço atual lido na loja. */
  trackedItemsCount: number;
  totalInitialCents: number;
  totalCurrentCents: number;
  /** Soma do quanto os itens baixaram desde o cadastro. */
  totalSavingsCents: number;
  /** Soma do quanto os itens subiram desde o cadastro. */
  totalIncreaseCents: number;
  itemsWithDropsCount: number;
  itemsAtLowestPriceCount: number;
}

/** Como a compra foi paga. Opcional: serve para o resumo por meio de pagamento. */
export type PaymentMethod = 'pix' | 'credit' | 'debit' | 'boleto' | 'cash' | 'other';

/** Uma loja onde o item está à venda (até 5 por item). A principal define o preço do item. */
export interface ItemOffer {
  id: string;
  url: string;
  domain: string;
  isPrimary: boolean;
  /** Último preço lido, no mesmo tipo de preço que o item acompanha (normal ou Pix). */
  currentPriceCents: number | null;
  pixPriceCents: number | null;
  inStock: boolean;
  lastCheckedAt: string | null;
  status: TrackingStatus;
}

export type ItemDocumentKind = 'invoice' | 'warranty' | 'manual' | 'other';

/** Nota fiscal, certificado de garantia ou manual guardado no item. */
export interface ItemDocument {
  id: string;
  itemId: string;
  kind: ItemDocumentKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  /** Endereço de download (sempre pelo servidor, que confere o acesso). */
  url: string;
}

export interface EnxovalItem {
  id: string;
  name: string;
  categoryId: string;
  category: Category;
  /** Derivado de `status`: verdadeiro quando o item já foi conquistado (comprei, ganhei ou já tenho). */
  checked: boolean;
  status: ItemStatus;
  link: string;
  description: string;
  /** Valor do item. A quantidade é só informativa e não multiplica o preço. */
  priceCents: number | null;
  /** Quantas unidades o item tem (1 a 999), para não repetir o mesmo item na lista. */
  quantity: number;
  /** Desconto ou cashback já abatido do preço (0 quando não há ou quando o item foi ganho). */
  discountCents: number;
  sortOrder: number;
  /** Semana de compra escolhida pela pessoa, contada a partir da semana da mudança (negativa: antes). Null: vale a sugestão. */
  buyWeek: number | null;
  /** Urgência de compra (1 a 5) inferida pelo Jev e guardada. Null: ainda não avaliada, ou o item mudou de nome ou ambiente. */
  aiUrgency?: number | null;
  /** Confiança (0 a 1) da nota de urgência. */
  aiUrgencyConfidence?: number | null;
  /** Dados do catálogo gravados quando o item veio do funil; nulos nos demais (o planejamento infere pelo nome). */
  priceCategory: PriceCategory | null;
  priority: ItemPriority | null;
  timing: ItemTiming | null;
  /** Item do catálogo mestre a que este item corresponde (nulo: item livre, ainda sem par no catálogo). */
  catalogItemId?: string | null;
  /** O que o catálogo sabe do item. Vale quando os campos do próprio item estão vazios. */
  catalog?: CatalogItemMeta | null;
  updatedAt: string;
  createdAt?: string;
  /** Variação escolhida na importação, como "220V" ou "110V · Preto". */
  selectedVariation?: string | null;
  priceTracking?: ItemPriceTracking | null;
  /** Em quantas parcelas a compra foi (ou será) feita: 1 é à vista. */
  installments?: number;
  /** AAAA-MM-DD do mês da primeira parcela. Nulo: vale o mês da compra ou o da semana planejada. */
  firstInstallmentOn?: string | null;
  /** AAAA-MM-DD do dia da compra, gravado ao passar para Comprado (editável). */
  purchasedAt?: string | null;
  paymentMethod?: PaymentMethod | null;
  /** Valor de cada parcela, só quando há juros (parcela × N diferente do preço). */
  installmentCents?: number | null;
  /** Quem do enxoval vai comprar o item. Nulo: ninguém ainda. */
  assigneeId?: string | null;
  /** De quem veio o presente (itens Recebidos). */
  giftFrom?: string | null;
  giftMessage?: string | null;
  /** Quando o agradecimento foi marcado como enviado. */
  thankedAt?: string | null;
  warrantyMonths?: number | null;
  /** AAAA-MM-DD do fim da garantia (calculado pela data da compra, mas editável). */
  warrantyUntil?: string | null;
  /** Onde foi comprado, quando não há link. */
  storeName?: string | null;
  /** Lojas onde o item está à venda; a principal (`isPrimary`) define o preço. */
  offers?: ItemOffer[];
  /** Quantos documentos (nota, garantia, manual) estão guardados no item. */
  documentCount?: number;
}

export interface AuthUser {
  avatarUrl?: string | null;
  onboardingCompleted?: boolean;
  trialUsed?: boolean;
  id: string;
  name: string;
  email: string;
  mustChangePassword?: boolean;
  /** Falso enquanto a conta nova não confirma o e-mail: o app mostra só a tela de confirmação. */
  emailVerified?: boolean;
  /** Conta criada por convite: usa só os enxovais de quem convidou e não cria enxovais próprios. */
  isGuest?: boolean;
  /** Plano da própria conta. Num enxoval compartilhado, valem os limites do plano de quem é dono. */
  plan?: AccountPlan;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  passwordResetExpiresAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  ipAddresses?: string[];
  workspaceCount: number;
  emailVerifiedAt?: string | null;
  devices?: AdminUserDevice[];
  /** Bloqueio da própria conta em vigor, se houver. */
  activeBan?: { id: string; reasonCode: string; expiresAt: string | null } | null;
}

export interface AdminUserDevice {
  deviceId: string;
  browser: string | null;
  os: string | null;
  device: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export type AdminBanTarget = "user" | "ip" | "cidr" | "device";

export interface AdminBan {
  id: string;
  targetType: AdminBanTarget;
  targetValue: string;
  /** Nome e e-mail quando o alvo é uma conta. */
  targetLabel: string | null;
  scope: "block_all" | "block_auth";
  reasonCode: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  active: boolean;
}

export interface EnxovalWorkspace {
  enxoval: EnxovalSummary;
  members: EnxovalMember[];
  categories: EnxovalCategory[];
  items: EnxovalItem[];
}

export interface BootstrapData {
  user: AuthUser;
  enxovais: EnxovalSummary[];
  activeEnxoval: EnxovalSummary | null;
  members: EnxovalMember[];
  categories: EnxovalCategory[];
  items: EnxovalItem[];
}

/** Respostas do Nino (Jev) para um item que a pessoa está cadastrando. Cada parte vem vazia quando não há certeza. */
export interface ItemAssessment {
  /** Falso quando o Jev não está ligado no servidor (sem chave): o app segue sem a ajuda. */
  available: boolean;
  environment: { id: string; name: string; confidence: number } | null;
  redundancy: { probability: number; overlapsWith: string | null } | null;
  /** De onde veio a resposta: do catálogo mestre (sem IA) ou do Jev. */
  source?: "catalog" | "jev";
  /** Item do catálogo que corresponde ao nome digitado, com a faixa comum de preço quando houver. */
  catalogItem?: Pick<CatalogSearchResult, "id" | "name" | "priceRange"> | null;
}

export interface NextItemRecommendation {
  available: boolean;
  recommendation: {
    name: string;
    essential: boolean;
    confidence: number;
    /** Há um favorito claro. Se não, mostre `options` para a pessoa escolher. */
    clear: boolean;
    /** As melhores opções, da mais provável para a menos; a primeira é `name`. */
    options: { name: string; essential: boolean; probability: number }[];
    categoryId: string;
    categoryName: string;
  } | null;
  /** Por que não há sugestão: "complete" (o catálogo todo já está na lista), "none" (nada indispensável falta, ou o Jev não teve certeza) ou "unknown_room". */
  reason?: "complete" | "none" | "unknown_room" | "unavailable";
}

export interface ItemUrgencyResult {
  available: boolean;
  categoryId: string;
  /** Nota de todos os itens pendentes do ambiente que já foram avaliados (antes ou agora). */
  scores: { id: string; urgency: number; confidence: number }[];
  /** Itens avaliados agora, com uma consulta nova ao Jev. */
  inferred: number;
  /** Itens que já tinham nota guardada e não gastaram consulta. */
  cached: number;
  /** Itens pendentes que ficaram sem nota (limite por consulta, ou o Jev não respondeu). */
  unscored: number;
}

