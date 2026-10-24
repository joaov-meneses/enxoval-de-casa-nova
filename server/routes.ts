import { httpErrorHandler } from './httpLogging.ts';
import { saveSignupGrowth } from './acquisition.ts';
import { getLogger, setLogUser } from './logger.ts';
import { randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import express, { Express, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { MAX_ENVIRONMENT_NAME_LENGTH, MAX_ITEM_NAME_LENGTH, normalizeEnvironmentName, normalizeEnxovalName } from '../src/data.ts';
import { DEFAULT_ITEM_QUANTITY, isValidQuantity, quantityFromDescription } from '../src/itemQuantity.ts';
import { DEFAULT_ITEM_STATUS, isDoneStatus, isItemStatus, resolveDiscountCents, statusFromChecked, type ItemStatus } from '../src/itemStatus.ts';
import type { AuthUser, BootstrapData, EnxovalCategory, EnxovalInvitation, EnxovalItem, EnxovalMember, EnxovalSummary, EnxovalWorkspace, InvitationPreview, ItemOffer, ItemPriceHistory, ItemPriceTracking, ItemTrackingInput, PaymentMethod, PriceBasis, TrackingStatus } from '../src/types.ts';
import { computeSavings } from '../src/priceTracking.ts';
import { getPool, withTransaction, Queryable } from './database.ts';
import { asyncHandler, cookieOptions, getCookie, hashPassword, hashSessionToken, HttpError, loginRateLimit, protectMutationOrigin, rateLimit, verifyPassword } from './security.ts';
import { registerAdminRoutes } from './admin.ts';
import { recordReturn } from './lifecycle/tracking.ts';
import { registerFeedbackRoutes } from './feedback.ts';
import { registerAiRoutes } from './ai.ts';
import { urgencyKey } from './services/jev.ts';
import { findItemInTitle, linkItemsToCatalog, queueResolution } from './catalog/store.ts';
import { registerCatalogRoutes } from './catalog/routes.ts';
import { appBaseUrl, canDeliverMail, emailVerificationEmail, invitationEmail, passwordChangedEmail, passwordResetEmail, sendMail } from './mailer.ts';
import { assertNotBlocked, checkSignupBurst, emailVerificationRequired, enforceBans, ensureDevice, recordDevice, recordLoginFailure, type ClientContext } from './trust.ts';
import { parseOnboardingProfile, type OnboardingProfile } from './onboarding-profile.ts';
import { isPriceCategory, isSpendingTier, type PriceCategory, type SpendingTier } from '../src/planning/spending.ts';
import { isBuyWeek, MAX_BUY_WEEK, MIN_BUY_WEEK, type ItemPriority, type ItemTiming } from '../src/planning/purchasePlan.ts';
import { cityById, cityMatchesState } from '../src/onboarding/regions.ts';
import { ScrapeError, rememberPreview, scrapeProduct } from './services/productScraper.ts';
import { findOrCreateTrackedProduct, requireTrackableUrl } from './trackedProducts.ts';
import { assertCanAddItem, assertCanCreateEnvironment, assertCanCreateEnxoval, effectivePlanSql, subscriptionRequired, trimToLimits } from './freemium.ts';
import { registerBillingRoutes, recoverBillingAccess } from './billing.ts';
import { registerProfileRoutes } from './profile.ts';
import { offerHistories, registerItemOfferRoutes, syncPrimaryOffer } from './itemOffers.ts';
import { registerItemDocumentRoutes } from './itemDocuments.ts';
import { parseItemExtras } from './itemExtras.ts';
import { isAccountPlan, type AccountPlan, type PlanLimits } from '../src/plans.ts';
import { passwordPolicyError } from '../shared/passwordPolicy.ts';

const SESSION_COOKIE = 'enxoval_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const RESET_TOKEN_TTL_MS = 60 * 60_000;
const RESET_REQUEST_COOLDOWN_SECONDS = 60;
const EMAIL_VERIFICATION_TTL_HOURS = 48;
const EMAIL_VERIFICATION_COOLDOWN_SECONDS = 60;
const INVITATION_TTL_DAYS = 7;
const INVITATION_TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60_000;
const INVITATION_RESEND_COOLDOWN_SECONDS = 60;
const MAX_PENDING_INVITATIONS = 20;

interface DbUserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  is_active: boolean;
  is_guest: boolean;
  must_change_password: boolean;
  password_reset_expires_at: Date | null;
  email_verified_at: Date | null;
  plan: AccountPlan;
}

interface EnxovalRow {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  role: 'owner' | 'editor';
  discount_cents: number;
  move_date: string | null;
  state: string | null;
  city: string | null;
  spending_tier: SpendingTier;
  monthly_budget_cents: number | null;
}

interface InvitationRow {
  id: string;
  email: string;
  created_at: Date;
  expires_at: Date;
}

interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'editor';
  avatar_version?: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  sort_order: number;
}

interface ItemRow {
  id: string;
  name: string;
  category_id: string;
  category: string;
  checked: boolean;
  status: ItemStatus;
  link: string;
  description: string;
  price_cents: number | null;
  discount_cents: number;
  quantity: number;
  sort_order: number;
  buy_week: number | null;
  ai_urgency: number | null;
  ai_urgency_confidence: number | null;
  ai_urgency_key: string | null;
  price_category: number | null;
  priority: ItemPriority | null;
  timing: ItemTiming | null;
  catalog_item_id: string | null;
  catalog_price_category: number | null;
  catalog_priority: ItemPriority | null;
  catalog_timing: ItemTiming | null;
  catalog_lead_time_weeks: number | null;
  catalog_p10: number | null;
  catalog_p50: number | null;
  catalog_p90: number | null;
  catalog_samples: number | null;
  catalog_region: string | null;
  updated_at: string | Date;
  created_at: string | Date;
  selected_variation: string | null;
  tracked_product_id: string | null;
  initial_price_cents: number | null;
  target_price_cents: number | null;
  price_alert_enabled: boolean;
  price_basis: PriceBasis;
  tracked_url: string | null;
  tracked_domain: string | null;
  tracked_in_stock: boolean | null;
  tracked_last_scraped_at: string | Date | null;
  tracked_status: TrackingStatus | null;
  tracked_current_cents: number | null;
  tracked_low60_cents: number | null;
  tracked_high60_cents: number | null;
  tracked_samples60: number | null;
  installments: number;
  first_installment_on: string | null;
  purchased_at: string | null;
  payment_method: PaymentMethod | null;
  installment_cents: number | null;
  assignee_id: string | null;
  gift_from: string | null;
  gift_message: string | null;
  thanked_at: string | Date | null;
  warranty_months: number | null;
  warranty_until: string | null;
  store_name: string | null;
  offers: OfferJson[] | null;
  document_count: number | null;
}

interface OfferJson {
  id: string;
  url: string;
  domain: string;
  is_primary: boolean;
  current_cents: number | null;
  pix_cents: number | null;
  in_stock: boolean | null;
  last_scraped_at: string | null;
  status: TrackingStatus | null;
}

interface TemplateRow {
  id: string;
}

interface TemplateCategoryRow {
  id: string;
  name: string;
  sort_order: number;
}

interface TemplateItemRow {
  category_id: string;
  name: string;
  sort_order: number;
}

function normalizeEmail(email: unknown) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function requireText(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${fieldName} é obrigatório.`);
  }

  return value.trim();
}

/** Só para senha nova: o login segue aceitando senhas cadastradas antes da regra. */
function requireNewPassword(value: unknown, fieldName: string) {
  const password = requireText(value, fieldName);
  const problem = passwordPolicyError(password);
  if (problem) throw new HttpError(400, problem);
  return password;
}

function requireEnvironmentName(value: unknown) {
  // Uma linha só: quebras de linha e espaços repetidos viram um espaço antes de contar os caracteres.
  const name = normalizeEnvironmentName(requireText(value, 'Nome do ambiente'));
  if (!name) throw new HttpError(400, 'Nome do ambiente é obrigatório.');
  if (name.length > MAX_ENVIRONMENT_NAME_LENGTH) {
    throw new HttpError(400, `O nome do ambiente pode ter no máximo ${MAX_ENVIRONMENT_NAME_LENGTH} caracteres.`);
  }
  return name;
}

function mapUser(row: Pick<DbUserRow, 'id' | 'name' | 'email'> & Partial<Pick<DbUserRow, 'must_change_password' | 'is_guest' | 'plan' | 'email_verified_at'>>): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mustChangePassword: row.must_change_password ?? false,
    // Linha sem a coluna (consulta que não a pediu) não trava ninguém.
    emailVerified: row.email_verified_at === undefined || Boolean(row.email_verified_at) || !emailVerificationRequired(),
    isGuest: row.is_guest ?? false,
    plan: isAccountPlan(row.plan) ? row.plan : 'free'
  };
}

function mapInvitation(row: InvitationRow): EnxovalInvitation {
  return {
    id: row.id,
    email: row.email,
    createdAt: serializeTimestamp(row.created_at),
    expiresAt: serializeTimestamp(row.expires_at)
  };
}

function mapEnxoval(row: EnxovalRow): EnxovalSummary {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    role: row.role,
    discountCents: Number(row.discount_cents ?? 0),
    moveDate: row.move_date ?? null,
    state: row.state ?? null,
    city: row.city ?? null,
    spendingTier: row.spending_tier ?? 'equilibrado',
    monthlyBudgetCents: row.monthly_budget_cents === null || row.monthly_budget_cents === undefined ? null : Number(row.monthly_budget_cents)
  };
}

function mapMember(row: MemberRow, enxovalId: string): EnxovalMember {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatar_version
      ? `/api/enxovais/${encodeURIComponent(enxovalId)}/members/${encodeURIComponent(row.id)}/avatar?v=${row.avatar_version}`
      : null
  };
}

function serializeTimestamp(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapCategory(row: CategoryRow): EnxovalCategory {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order
  };
}

function nullableCents(value: number | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}

function mapPriceTracking(row: ItemRow): ItemPriceTracking | null {
  if (!row.tracked_product_id || !row.tracked_url) return null;
  const current = nullableCents(row.tracked_current_cents);
  const low = nullableCents(row.tracked_low60_cents);
  const high = nullableCents(row.tracked_high60_cents);
  return {
    domain: row.tracked_domain ?? '',
    url: row.tracked_url,
    initialPriceCents: nullableCents(row.initial_price_cents),
    targetPriceCents: nullableCents(row.target_price_cents),
    priceAlertEnabled: row.price_alert_enabled,
    priceBasis: row.price_basis,
    currentPriceCents: current,
    lowestPriceCents60d: low,
    // "Menor preço dos últimos 60 dias" só vale quando houve variação: preço sempre igual não é destaque.
    isLowestIn60d: current !== null && low !== null && high !== null && Number(row.tracked_samples60 ?? 0) >= 2 && current <= low && high > current,
    inStock: row.tracked_in_stock ?? true,
    lastCheckedAt: row.tracked_last_scraped_at ? serializeTimestamp(row.tracked_last_scraped_at) : null,
    status: row.tracked_status ?? 'pending'
  };
}

function mapOffer(offer: OfferJson): ItemOffer {
  return {
    id: offer.id,
    url: offer.url,
    domain: offer.domain,
    isPrimary: offer.is_primary,
    currentPriceCents: nullableCents(offer.current_cents),
    pixPriceCents: nullableCents(offer.pix_cents),
    inStock: offer.in_stock ?? true,
    lastCheckedAt: offer.last_scraped_at ?? null,
    status: offer.status ?? 'pending'
  };
}

function hasValidUrgency(row: ItemRow) {
  return row.ai_urgency !== null && row.ai_urgency !== undefined && row.ai_urgency_key === urgencyKey(row.name, row.category);
}

function mapItem(row: ItemRow): EnxovalItem {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    category: row.category,
    checked: row.checked,
    status: row.status,
    link: row.link,
    description: row.description,
    priceCents: row.price_cents === null ? null : Number(row.price_cents),
    quantity: Number(row.quantity ?? 1),
    discountCents: Number(row.discount_cents ?? 0),
    sortOrder: row.sort_order,
    buyWeek: row.buy_week === null || row.buy_week === undefined ? null : Number(row.buy_week),
    // A nota do Jev só vale para o nome e o ambiente em que foi inferida.
    aiUrgency: hasValidUrgency(row) ? Number(row.ai_urgency) : null,
    aiUrgencyConfidence: hasValidUrgency(row) ? Number(row.ai_urgency_confidence ?? 0) : null,
    priceCategory: isPriceCategory(Number(row.price_category)) ? Number(row.price_category) as PriceCategory : null,
    priority: row.priority ?? null,
    timing: row.timing ?? null,
    catalogItemId: row.catalog_item_id ?? null,
    // O que o catálogo sabe do item vale quando o próprio item não diz nada (ver `itemMeta`).
    catalog: row.catalog_item_id
      ? {
          priceCategory: isPriceCategory(Number(row.catalog_price_category)) ? Number(row.catalog_price_category) as PriceCategory : null,
          priority: row.catalog_priority ?? null,
          timing: row.catalog_timing ?? null,
          leadTimeWeeks: Number(row.catalog_lead_time_weeks ?? 0),
          priceRange: row.catalog_p50 === null || row.catalog_p50 === undefined
            ? null
            : {
                p10: Number(row.catalog_p10),
                p50: Number(row.catalog_p50),
                p90: Number(row.catalog_p90),
                samples: Number(row.catalog_samples),
                region: row.catalog_region ?? ''
              }
        }
      : null,
    createdAt: serializeTimestamp(row.created_at),
    updatedAt: serializeTimestamp(row.updated_at),
    selectedVariation: row.selected_variation,
    priceTracking: mapPriceTracking(row),
    installments: Number(row.installments ?? 1),
    firstInstallmentOn: row.first_installment_on ?? null,
    purchasedAt: row.purchased_at ?? null,
    paymentMethod: row.payment_method ?? null,
    installmentCents: nullableCents(row.installment_cents),
    assigneeId: row.assignee_id ?? null,
    giftFrom: row.gift_from ?? null,
    giftMessage: row.gift_message ?? null,
    thankedAt: row.thanked_at ? serializeTimestamp(row.thanked_at) : null,
    warrantyMonths: row.warranty_months === null || row.warranty_months === undefined ? null : Number(row.warranty_months),
    warrantyUntil: row.warranty_until ?? null,
    storeName: row.store_name ?? null,
    offers: (row.offers ?? []).map(mapOffer),
    documentCount: Number(row.document_count ?? 0)
  };
}

// Item com ambiente e, quando acompanha o preço de uma loja, o preço lido e o menor dos últimos 60 dias (no mesmo
// preço que o item acompanha: normal ou Pix).
const ITEM_SELECT = `
  SELECT
    i.id,
    i.name,
    i.category_id,
    c.name AS category,
    i.checked,
    i.status,
    i.link,
    i.description,
    i.price_cents,
    i.discount_cents,
    i.quantity,
    i.sort_order,
    i.buy_week,
    i.ai_urgency,
    i.ai_urgency_confidence,
    i.ai_urgency_key,
    i.price_category,
    i.priority,
    i.timing,
    i.created_at,
    i.updated_at,
    i.selected_variation,
    i.tracked_product_id,
    i.initial_price_cents,
    i.target_price_cents,
    i.price_alert_enabled,
    i.price_basis,
    i.catalog_item_id,
    ci.price_category AS catalog_price_category,
    ci.priority AS catalog_priority,
    ci.timing AS catalog_timing,
    ci.lead_time_weeks AS catalog_lead_time_weeks,
    cps.p10 AS catalog_p10,
    cps.p50 AS catalog_p50,
    cps.p90 AS catalog_p90,
    cps.samples AS catalog_samples,
    cps.region AS catalog_region,
    tp.url AS tracked_url,
    tp.domain AS tracked_domain,
    tp.in_stock AS tracked_in_stock,
    tp.last_scraped_at AS tracked_last_scraped_at,
    tp.last_scrape_status AS tracked_status,
    CASE WHEN i.price_basis = 'pix' THEN tp.pix_price_cents ELSE tp.current_price_cents END AS tracked_current_cents,
    ps.low_cents AS tracked_low60_cents,
    ps.high_cents AS tracked_high60_cents,
    ps.samples AS tracked_samples60,
    i.installments,
    to_char(i.first_installment_on, 'YYYY-MM-DD') AS first_installment_on,
    to_char(i.purchased_at, 'YYYY-MM-DD') AS purchased_at,
    i.payment_method,
    i.installment_cents,
    i.assignee_id,
    i.gift_from,
    i.gift_message,
    i.thanked_at,
    i.warranty_months,
    to_char(i.warranty_until, 'YYYY-MM-DD') AS warranty_until,
    i.store_name,
    offers.list AS offers,
    docs.total AS document_count
  FROM items i
  INNER JOIN categories c ON c.id = i.category_id
  LEFT JOIN tracked_products tp ON tp.id = i.tracked_product_id
  LEFT JOIN catalog_items ci ON ci.id = i.catalog_item_id
  -- Faixa real de preço do item: a do estado do enxoval quando há amostra, senão a do Brasil todo ('').
  LEFT JOIN LATERAL (
    SELECT ps.p10, ps.p50, ps.p90, ps.samples, ps.region
    FROM catalog_price_stats ps
    WHERE ps.item_id = i.catalog_item_id
      AND ps.region IN ('', COALESCE((SELECT e.state FROM enxovais e WHERE e.id = i.enxoval_id), ''))
    ORDER BY ps.region DESC
    LIMIT 1
  ) cps ON true
  LEFT JOIN LATERAL (
    SELECT MIN(v) AS low_cents, MAX(v) AS high_cents, COUNT(v)::int AS samples
    FROM (
      SELECT CASE WHEN i.price_basis = 'pix' THEN s.pix_price_cents ELSE s.price_cents END AS v
      FROM product_price_snapshots s
      WHERE s.tracked_product_id = i.tracked_product_id
        AND s.captured_at >= now() - interval '60 days'
    ) recent
    WHERE v IS NOT NULL
  ) ps ON true
  -- Lojas do item (até 3), a principal primeiro; o preço lido segue o tipo de preço do item.
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object(
      'id', o.id, 'url', otp.url, 'domain', otp.domain, 'is_primary', o.is_primary,
      'current_cents', CASE WHEN i.price_basis = 'pix' THEN otp.pix_price_cents ELSE otp.current_price_cents END,
      'pix_cents', otp.pix_price_cents, 'in_stock', otp.in_stock,
      'last_scraped_at', to_char(otp.last_scraped_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'status', otp.last_scrape_status
    ) ORDER BY o.is_primary DESC, o.created_at ASC) AS list
    FROM item_offers o
    INNER JOIN tracked_products otp ON otp.id = o.tracked_product_id
    WHERE o.item_id = i.id
  ) offers ON true
  LEFT JOIN LATERAL (SELECT COUNT(*)::int AS total FROM item_documents d WHERE d.item_id = i.id) docs ON true
`;

// Data da mudança como texto AAAA-MM-DD: o driver converteria `date` em um Date no fuso do servidor.
const ENXOVAL_COLUMNS = `
    e.id, e.name, e.owner_id, o.name AS owner_name, e.discount_cents,
    to_char(e.move_date, 'YYYY-MM-DD') AS move_date, e.state, e.city, e.spending_tier, e.monthly_budget_cents`;

async function fetchEnxovais(queryable: Queryable, userId: string) {
  const result = await queryable.query<EnxovalRow>(`
    SELECT ${ENXOVAL_COLUMNS}, em.role
    FROM enxovais e
    INNER JOIN enxoval_members em ON em.enxoval_id = e.id
    INNER JOIN users o ON o.id = e.owner_id
    WHERE em.user_id = $1
    ORDER BY CASE em.role WHEN 'owner' THEN 0 ELSE 1 END, e.created_at ASC, e.name ASC
  `, [userId]);

  return result.rows.map(mapEnxoval);
}

async function requireEnxovalMember(queryable: Queryable, userId: string, enxovalId: string) {
  const result = await queryable.query<{ role: 'owner' | 'editor' }>(`
    SELECT role
    FROM enxoval_members
    WHERE enxoval_id = $1 AND user_id = $2
  `, [enxovalId, userId]);

  if (!result.rows[0]) throw new HttpError(404, 'Enxoval não encontrado.');
  const owner = await queryable.query<{plan: string}>(`SELECT ${effectivePlanSql('u')} AS plan FROM enxovais e JOIN users u ON u.id = e.owner_id WHERE e.id = $1`, [enxovalId]);
  if (owner.rows[0]?.plan === 'free') throw subscriptionRequired();
  return result.rows[0].role;
}
async function requireEnxovalOwner(queryable: Queryable, userId: string, enxovalId: string) {
  const role = await requireEnxovalMember(queryable, userId, enxovalId);
  if (role !== 'owner') throw new HttpError(403, 'Apenas o dono pode alterar esse enxoval.');
}

async function fetchEnxoval(queryable: Queryable, userId: string, enxovalId: string) {
  const result = await queryable.query<EnxovalRow>(`
    SELECT ${ENXOVAL_COLUMNS}, em.role
    FROM enxovais e
    INNER JOIN enxoval_members em ON em.enxoval_id = e.id
    INNER JOIN users o ON o.id = e.owner_id
    WHERE e.id = $1 AND em.user_id = $2
    LIMIT 1
  `, [enxovalId, userId]);

  if (!result.rows[0]) throw new HttpError(404, 'Enxoval não encontrado.');
  return mapEnxoval(result.rows[0]);
}

async function fetchMembers(queryable: Queryable, userId: string, enxovalId: string) {
  await requireEnxovalMember(queryable, userId, enxovalId);

  const result = await queryable.query<MemberRow>(`
    SELECT u.id, u.name, u.email, em.role, u.avatar_version
    FROM enxoval_members em
    INNER JOIN users u ON u.id = em.user_id
    WHERE em.enxoval_id = $1
    ORDER BY CASE em.role WHEN 'owner' THEN 0 ELSE 1 END, u.name ASC, u.email ASC
  `, [enxovalId]);

  return result.rows.map(row => mapMember(row, enxovalId));
}

async function fetchCategories(queryable: Queryable, userId: string, enxovalId: string) {
  await requireEnxovalMember(queryable, userId, enxovalId);

  const result = await queryable.query<CategoryRow>(`
    SELECT id, name, sort_order
    FROM categories
    WHERE enxoval_id = $1
    ORDER BY sort_order ASC, name ASC
  `, [enxovalId]);

  return result.rows.map(mapCategory);
}

async function fetchItems(queryable: Queryable, userId: string, enxovalId: string) {
  await requireEnxovalMember(queryable, userId, enxovalId);

  const result = await queryable.query<ItemRow>(`
    ${ITEM_SELECT}
    WHERE i.enxoval_id = $1
    ORDER BY c.sort_order ASC, i.sort_order ASC, i.created_at ASC
  `, [enxovalId]);

  return result.rows.map(mapItem);
}

async function fetchWorkspace(queryable: Queryable, userId: string, enxovalId: string): Promise<EnxovalWorkspace> {
  const enxoval = await fetchEnxoval(queryable, userId, enxovalId);
  const members = await fetchMembers(queryable, userId, enxovalId);
  const categories = await fetchCategories(queryable, userId, enxovalId);
  const items = await fetchItems(queryable, userId, enxovalId);

  return { enxoval, members, categories, items };
}

async function fetchBootstrap(user: AuthUser, requestedEnxovalId?: string): Promise<BootstrapData> {
  if (user.mustChangePassword || !user.emailVerified) return { user, enxovais: [], activeEnxoval: null, members: [], categories: [], items: [] };
  if (user.plan === 'free' && !user.isGuest) {
    const recovered = await recoverBillingAccess(user.id);
    if (isAccountPlan(recovered.plan)) user = { ...user, plan: recovered.plan };
  }
  const state = await getPool().query<{ onboarding_completed_at: Date | null; trial_used: boolean; avatar_version: string | null }>('SELECT onboarding_completed_at, trial_used, avatar_version FROM users WHERE id = $1', [user.id]);
  user = { ...user, onboardingCompleted: Boolean(state.rows[0]?.onboarding_completed_at), trialUsed: state.rows[0]?.trial_used ?? false, avatarUrl: state.rows[0]?.avatar_version ? `/api/profile/avatar?v=${state.rows[0].avatar_version}` : null };
  const enxovais = await fetchEnxovais(getPool(), user.id);
  // Um enxoval pedido que a pessoa não acessa mais (ex.: ela foi removida como convidada) cai no primeiro da lista.
  const activeEnxovalId = enxovais.find(enxoval => enxoval.id === requestedEnxovalId)?.id ?? enxovais[0]?.id;
  const access = activeEnxovalId ? await getPool().query<{plan: string}>(`SELECT ${effectivePlanSql('u')} AS plan FROM enxovais e JOIN users u ON u.id = e.owner_id WHERE e.id = $1`, [activeEnxovalId]) : null;
  const workspace = activeEnxovalId && access?.rows[0]?.plan !== 'free'
    ? await fetchWorkspace(getPool(), user.id, activeEnxovalId)
    : null;

  return {
    user,
    enxovais,
    activeEnxoval: workspace?.enxoval ?? null,
    members: workspace?.members ?? [],
    categories: workspace?.categories ?? [],
    items: workspace?.items ?? []
  };
}

async function findCategory(queryable: Queryable, userId: string, enxovalId: string, categoryId: string) {
  await requireEnxovalMember(queryable, userId, enxovalId);

  const result = await queryable.query<CategoryRow>(`
    SELECT id, name, sort_order
    FROM categories
    WHERE id = $1 AND enxoval_id = $2
  `, [categoryId, enxovalId]);

  return result.rows[0] ? mapCategory(result.rows[0]) : null;
}

async function findOrCreateCategory(client: PoolClient, userId: string, enxovalId: string, name: string, preferredOrder?: number) {
  await requireEnxovalMember(client, userId, enxovalId);

  // Um ambiente com esse nome já existe: é o mesmo, não conta no limite do plano.
  const existing = await client.query('SELECT 1 FROM categories WHERE enxoval_id = $1 AND name = $2', [enxovalId, name]);
  if (!existing.rowCount) await assertCanCreateEnvironment(client, enxovalId);

  const orderResult = await client.query<{ next_order: number }>(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
    FROM categories
    WHERE enxoval_id = $1
  `, [enxovalId]);

  const result = await client.query<CategoryRow>(`
    INSERT INTO categories (id, user_id, enxoval_id, name, sort_order)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (enxoval_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name, sort_order
  `, [randomUUID(), userId, enxovalId, name, preferredOrder ?? orderResult.rows[0]?.next_order ?? 0]);

  return mapCategory(result.rows[0]);
}

async function seedEnxovalDefaults(client: PoolClient, userId: string, enxovalId: string, limits: PlanLimits) {
  const templateResult = await client.query<TemplateRow>(`
    SELECT id
    FROM enxoval_templates
    WHERE is_default = true
    ORDER BY created_at ASC
    LIMIT 1
  `);

  const templateId = templateResult.rows[0]?.id;
  if (!templateId) return;

  const templateCategories = await client.query<TemplateCategoryRow>(`
    SELECT id, name, sort_order
    FROM template_categories
    WHERE template_id = $1
    ORDER BY sort_order ASC, name ASC
  `, [templateId]);

  const categoryIds = new Map<string, string>();
  const keptCategories = limits.environments === null ? templateCategories.rows : templateCategories.rows.slice(0, limits.environments);

  for (const templateCategory of keptCategories) {
    const category = await findOrCreateCategory(client, userId, enxovalId, templateCategory.name, templateCategory.sort_order);
    categoryIds.set(templateCategory.id, category.id);
  }

  const templateItems = await client.query<TemplateItemRow>(`
    SELECT category_id, name, sort_order
    FROM template_items
    WHERE template_id = $1
    ORDER BY sort_order ASC, name ASC
  `, [templateId]);

  const itemsPerCategory = new Map<string, number>();

  for (const item of templateItems.rows) {
    const categoryId = categoryIds.get(item.category_id);
    if (!categoryId) continue;
    const seeded = itemsPerCategory.get(categoryId) ?? 0;
    if (limits.itemsPerEnvironment !== null && seeded >= limits.itemsPerEnvironment) continue;
    itemsPerCategory.set(categoryId, seeded + 1);

    await client.query(`
      INSERT INTO items (id, user_id, enxoval_id, category_id, name, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [randomUUID(), userId, enxovalId, categoryId, item.name, item.sort_order]);
  }
}

interface EnxovalPlanItem {
  name: string;
  description: string;
  priceCategory: PriceCategory | null;
  priority: ItemPriority | null;
  timing: ItemTiming | null;
}

interface EnxovalPlan {
  categories: { name: string; items: EnxovalPlanItem[] }[];
}

/** Campo opcional de um item do plano: ausente vale null; qualquer valor fora da lista recusa o plano. */
function planField<T>(value: unknown, isValid: (value: unknown) => value is T): T | null {
  if (value === undefined || value === null) return null;
  if (!isValid(value)) throw new HttpError(400, 'Plano inválido.');
  return value;
}

const isPriority = (value: unknown): value is ItemPriority => value === 'essential' || value === 'optional';
const isTiming = (value: unknown): value is ItemTiming => value === 'first_night' || value === 'first_week';

const MAX_PLAN_CATEGORIES = 15;
const MAX_PLAN_ITEMS = 400;

/**
 * Plano gerado pelo funil de onboarding: ambientes e itens, com limites para não virar um vetor de abuso.
 * `allowNoRooms`: a pessoa escolheu "nenhum ambiente agora"; o plano chega vazio e o enxoval nasce sem ambientes.
 */
export function parseOnboardingPlan(value: unknown, allowEmptyItems = false, allowNoRooms = false): EnxovalPlan | null {
  if (value === undefined || value === null) return null;
  const categories = (value as { categories?: unknown })?.categories;
  if (allowNoRooms) {
    // Sem ambientes escolhidos, o plano só pode vir vazio: nada de ambientes que a pessoa não pediu.
    if (!Array.isArray(categories) || categories.length > 0) throw new HttpError(400, 'Plano inválido.');
    return { categories: [] };
  }
  if (!Array.isArray(categories) || categories.length === 0 || categories.length > MAX_PLAN_CATEGORIES) {
    throw new HttpError(400, 'Plano inválido.');
  }

  let totalItems = 0;
  const parsed = categories.map(category => {
    const items = (category as { items?: unknown })?.items;
    if (!Array.isArray(items)) throw new HttpError(400, 'Plano inválido.');
    totalItems += items.length;
    if (totalItems > MAX_PLAN_ITEMS) throw new HttpError(400, 'Plano com itens demais.');

    return {
      name: requireEnvironmentName((category as { name?: unknown }).name),
      items: items.map(item => {
        const rawName = (item as { name?: unknown })?.name;
        const rawDescription = (item as { description?: unknown })?.description;
        const name = requireText(rawName, 'Nome do item');
        if (name.length > 120) throw new HttpError(400, 'Nome do item muito longo.');
        const description = typeof rawDescription === 'string' ? rawDescription.trim() : '';
        if (description.length > 200) throw new HttpError(400, 'Descrição do item muito longa.');
        const meta = item as { priceCategory?: unknown; priority?: unknown; timing?: unknown };
        return {
          name,
          description,
          priceCategory: planField(meta.priceCategory, isPriceCategory),
          priority: planField(meta.priority, isPriority),
          timing: planField(meta.timing, isTiming)
        };
      })
    };
  });

  if (new Set(parsed.map(category => category.name)).size !== parsed.length) {
    throw new HttpError(400, 'Plano com ambientes repetidos.');
  }
  if (totalItems === 0 && !allowEmptyItems) throw new HttpError(400, 'Plano sem itens.');
  if (totalItems > 0 && allowEmptyItems) throw new HttpError(400, 'A escolha sem itens deve criar apenas os ambientes.');

  return { categories: parsed };
}

async function seedEnxovalPlan(client: PoolClient, userId: string, enxovalId: string, plan: EnxovalPlan) {
  for (const [categoryIndex, planCategory] of plan.categories.entries()) {
    const category = await findOrCreateCategory(client, userId, enxovalId, planCategory.name, categoryIndex);
    if (planCategory.items.length === 0) continue;

    await client.query(`
      INSERT INTO items (id, user_id, enxoval_id, category_id, name, description, sort_order, quantity, price_category, priority, timing)
      SELECT t.id, $1::uuid, $2::uuid, $3::uuid, t.name, t.description, t.sort_order, t.quantity, t.price_category, t.priority, t.timing
      FROM unnest($4::uuid[], $5::text[], $6::text[], $7::int[], $8::int[], $9::smallint[], $10::text[], $11::text[])
        AS t(id, name, description, sort_order, quantity, price_category, priority, timing)
    `, [
      userId,
      enxovalId,
      category.id,
      planCategory.items.map(() => randomUUID()),
      planCategory.items.map(item => item.name),
      planCategory.items.map(item => item.description),
      planCategory.items.map((_, index) => index),
      planCategory.items.map(item => quantityFromDescription(item.description)),
      planCategory.items.map(item => item.priceCategory),
      planCategory.items.map(item => item.priority),
      planCategory.items.map(item => item.timing)
    ]);
  }
}

async function insertEnxoval(
  client: PoolClient,
  userId: string,
  name: string,
  limits: PlanLimits,
  options: { useDefaultTemplate?: boolean; plan?: EnxovalPlan | null; profile?: OnboardingProfile | null } = {}
) {
  const enxovalId = randomUUID();

  // As respostas que o planejamento usa depois (data, lugar e perfil de gasto) também viram colunas editáveis.
  const profile = options.profile ?? null;
  await client.query(`
    INSERT INTO enxovais (id, name, owner_id, onboarding_profile, move_date, state, city, spending_tier)
    VALUES ($1, $2, $3, $4::jsonb, $5::date, $6, $7, $8)
  `, [
    enxovalId, name, userId, profile ? JSON.stringify(profile) : null,
    profile?.moveDate ?? null, profile?.state ?? null, profile?.city ?? null, profile?.spendingTier ?? 'equilibrado'
  ]);

  await client.query(`
    INSERT INTO enxoval_members (enxoval_id, user_id, role)
    VALUES ($1, $2, 'owner')
  `, [enxovalId, userId]);

  // No plano gratuito o conteúdo inicial já nasce dentro do limite: os primeiros ambientes, com os primeiros itens.
  if (options.plan) {
    await seedEnxovalPlan(client, userId, enxovalId, { categories: trimToLimits(options.plan.categories, limits) });
  } else if (options.useDefaultTemplate !== false) {
    await seedEnxovalDefaults(client, userId, enxovalId, limits);
  }
  // Os itens do funil e do modelo já são do catálogo: o vínculo é só a resolução barata, sem consultar o Jev.
  const seeded = await client.query<{ id: string; name: string }>('SELECT id, name FROM items WHERE enxoval_id = $1', [enxovalId]);
  await linkItemsToCatalog(client, seeded.rows);

  return enxovalId;
}

function parseUserName(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length < 2 || name.length > 40) throw new HttpError(400, 'Informe um nome de 2 a 40 caracteres.');
  return name;
}

async function saveOnboardingDraft(userId: string, name: string, plan: EnxovalPlan, profile: OnboardingProfile, userName: string | null) {
  await withTransaction(async client => {
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const existing = await client.query('SELECT id FROM enxovais WHERE owner_id = $1 LIMIT 1', [userId]);
    if (existing.rows.length) throw new HttpError(409, 'Você já tem um enxoval. Acesse o aplicativo para continuar.');
    await client.query(`UPDATE users SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()), onboarding_draft = $2::jsonb, name = COALESCE($3, name) WHERE id = $1`, [userId, JSON.stringify({ name, plan, profile }), userName]);
  });
}

async function createEnxovalForUser(
  userId: string,
  name: string,
  options: { useDefaultTemplate?: boolean; plan?: EnxovalPlan | null; profile?: OnboardingProfile | null; userName?: string | null } = {}
) {
  return withTransaction(async client => {
    if (options.userName) {
      await client.query('UPDATE users SET name = $1 WHERE id = $2', [options.userName, userId]);
    }
    const limits = await assertCanCreateEnxoval(client, userId);
    const enxovalId = await insertEnxoval(client, userId, name, limits, options);
    return fetchWorkspace(client, userId, enxovalId);
  });
}

async function createSession(res: Response, userId: string, queryable: Queryable = getPool()) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await queryable.query(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, device_id)
    VALUES ($1, $2, $3, $4, $5)
  `, [randomUUID(), userId, tokenHash, expiresAt, typeof res.locals.deviceId === 'string' ? res.locals.deviceId : null]);

  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: SESSION_TTL_MS
  });
  await recordActivityDay(queryable, userId);
}

/** Um registro por dia de uso: mede retorno depois de cada e-mail (inclusive do grupo de controle) e a retenção. */
async function recordActivityDay(queryable: Queryable, userId: string) {
  await queryable.query(`
    INSERT INTO user_activity_days (user_id, day) VALUES ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
    ON CONFLICT DO NOTHING
  `, [userId]);
}

async function recordUserIpEvent(queryable: Queryable, userId: string, context: ClientContext, event: 'signup' | 'login' | 'invitation_signup') {
  await recordDevice(queryable, userId, context);
  if (!context.ip || !isIP(context.ip)) return;
  await queryable.query(`
    INSERT INTO user_ip_events (id, user_id, ip, event, device_id, user_agent)
    VALUES ($1, $2, $3::inet, $4, $5, $6)
  `, [randomUUID(), userId, context.ip, event, context.deviceId, context.userAgent]);
}

/**
 * Cria o link de confirmação de e-mail e o envia. Um novo pedido invalida o anterior; pedidos seguidos dentro do
 * intervalo mínimo são recusados. Só o hash do token vai para o banco.
 */
async function issueEmailVerification(userId: string): Promise<'sent' | 'cooldown' | 'verified'> {
  const base = appBaseUrl();
  if (!base) throw new HttpError(503, 'Não foi possível enviar o e-mail de confirmação agora. Tente novamente mais tarde.');
  const token = randomBytes(32).toString('base64url');
  const user = await withTransaction(async client => {
    const found = await client.query<{ name: string; email: string; email_verified_at: Date | null }>(
      'SELECT name, email, email_verified_at FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const row = found.rows[0];
    if (!row || row.email_verified_at) return 'verified' as const;
    const recent = await client.query(
      'SELECT 1 FROM email_verification_tokens WHERE user_id = $1 AND created_at > now() - make_interval(secs => $2) LIMIT 1',
      [userId, EMAIL_VERIFICATION_COOLDOWN_SECONDS]);
    if (recent.rowCount) return 'cooldown' as const;
    await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);
    await client.query(
      'INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(hours => $4))',
      [randomUUID(), userId, hashSessionToken(token), EMAIL_VERIFICATION_TTL_HOURS]);
    return row;
  });
  if (typeof user === 'string') return user;
  // O token vai no fragmento (#), que o navegador não envia ao servidor nem a outros sites pelo Referer.
  await sendMail(emailVerificationEmail({
    to: user.email,
    name: user.name,
    link: `${base}/verificar-email#token=${token}`,
    hours: EMAIL_VERIFICATION_TTL_HOURS
  }));
  return 'sent';
}

/**
 * Cria o link de redefinição e o envia por e-mail. Roda depois de a resposta já ter saído, então o tempo de resposta
 * não revela se o e-mail tem conta. Só o hash do token vai para o banco.
 */
async function issuePasswordReset(email: string) {
  const found = await getPool().query<{ id: string; name: string; email: string; is_active: boolean }>(
    'SELECT id, name, email, is_active FROM users WHERE email = $1 LIMIT 1', [email]);
  const user = found.rows[0];
  if (!user || !user.is_active) return;

  const base = appBaseUrl();
  if (!base) {
    getLogger().error({ event: 'password_reset.configuration_missing' }, 'Redefinição de senha: configure APP_URL para montar o link do e-mail.');
    return;
  }

  const token = randomBytes(32).toString('base64url');
  const created = await withTransaction(async client => {
    await client.query('DELETE FROM password_reset_tokens WHERE expires_at <= now()');
    // Trava a conta para duas solicitações simultâneas não gerarem dois links nem passarem do intervalo mínimo.
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    const recent = await client.query(
      `SELECT 1 FROM password_reset_tokens WHERE user_id = $1 AND created_at > now() - make_interval(secs => $2) LIMIT 1`,
      [user.id, RESET_REQUEST_COOLDOWN_SECONDS]);
    if (recent.rowCount) return false;
    // Um novo pedido invalida o link anterior.
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
    await client.query(
      'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [randomUUID(), user.id, hashSessionToken(token), new Date(Date.now() + RESET_TOKEN_TTL_MS)]);
    return true;
  });
  if (!created) return;

  // O token vai no fragmento (#), que o navegador não envia ao servidor nem a outros sites pelo Referer.
  await sendMail(passwordResetEmail({
    to: user.email,
    name: user.name,
    link: `${base}/redefinir-senha#token=${token}`,
    minutes: RESET_TOKEN_TTL_MS / 60_000
  }));
}

async function getCurrentUser(req: Request) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;

  const result = await getPool().query<DbUserRow>(`
    SELECT u.id, u.name, u.email, u.password_hash, u.must_change_password, u.is_guest, u.email_verified_at, ${effectivePlanSql('u')} AS plan
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active = true
      AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.target_type = 'user' AND b.target_value = u.id::text
        AND b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now()))
      AND s.created_at > now() - interval '7 days'
      AND s.last_activity_at > now() - interval '48 hours'
      AND (NOT u.must_change_password OR u.password_reset_expires_at > now())
    LIMIT 1
  `, [hashSessionToken(token)]);

  if (result.rows[0]) setLogUser(result.rows[0].id);
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

async function requireCurrentUser(req: Request, allowPasswordChange = false, allowUnverifiedEmail = false) {
  const user = await getCurrentUser(req);
  if (!user) throw new HttpError(401, 'Faça login para continuar.');
  if (user.mustChangePassword && !allowPasswordChange) throw new HttpError(403, 'Defina uma nova senha antes de acessar seu enxoval.');
  if (!user.emailVerified && !allowUnverifiedEmail) throw new HttpError(403, 'Confirme seu e-mail para continuar. Enviamos um link para a sua caixa de entrada.', 'EMAIL_NOT_VERIFIED');
  return user;
}

async function fetchItemRow(queryable: Queryable, itemId: string, enxovalId: string) {
  const result = await queryable.query<ItemRow>(`
    ${ITEM_SELECT}
    WHERE i.id = $1 AND i.enxoval_id = $2
  `, [itemId, enxovalId]);
  if (!result.rows[0]) throw new HttpError(404, 'Item não encontrado.');
  return mapItem(result.rows[0]);
}

const MAX_PRICE_CENTS = 1_000_000_000;

function parseOptionalCents(value: unknown, message: string) {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_PRICE_CENTS) throw new HttpError(400, message);
  return value;
}

/** AAAA-MM-DD de um dia que existe no calendário (recusa 2027-02-31 e 2027-13-01). */
function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Semana de compra escolhida pela pessoa: inteira, de ${MIN_BUY_WEEK} a ${MAX_BUY_WEEK}; null devolve a escolha ao algoritmo. */
function parseBuyWeek(value: unknown): number | null {
  if (value === null) return null;
  if (!isBuyWeek(value)) throw new HttpError(400, `Semana de compra inválida. Use um número inteiro de ${MIN_BUY_WEEK} a ${MAX_BUY_WEEK}.`);
  return value;
}

/** Lê e valida os campos opcionais de acompanhamento de preço. Só devolve as chaves que vieram no corpo. */
function parseTrackingInput(body: unknown): ItemTrackingInput {
  const source = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const has = (key: string) => Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined;
  const input: ItemTrackingInput = {};

  if (has('trackedProductUrl')) input.trackedProductUrl = source.trackedProductUrl === null ? null : requireTrackableUrl(source.trackedProductUrl);
  if (has('initialPriceCents')) input.initialPriceCents = parseOptionalCents(source.initialPriceCents, 'Preço de referência inválido.') as number | null;
  if (has('targetPriceCents')) input.targetPriceCents = parseOptionalCents(source.targetPriceCents, 'Preço desejado inválido.') as number | null;
  if (has('selectedVariation')) {
    const variation = source.selectedVariation;
    if (variation !== null && typeof variation !== 'string') throw new HttpError(400, 'Variação inválida.');
    const text = typeof variation === 'string' ? variation.trim() : '';
    if (text.length > 80) throw new HttpError(400, 'A variação pode ter no máximo 80 caracteres.');
    input.selectedVariation = text || null;
  }
  if (has('priceBasis')) {
    if (source.priceBasis !== 'regular' && source.priceBasis !== 'pix') throw new HttpError(400, 'Tipo de preço inválido.');
    input.priceBasis = source.priceBasis;
  }
  if (has('priceAlertEnabled')) {
    if (typeof source.priceAlertEnabled !== 'boolean') throw new HttpError(400, 'Aviso de preço inválido.');
    input.priceAlertEnabled = source.priceAlertEnabled;
  }
  return input;
}

async function createItemForUser(input: { userId: string; enxovalId: string; name: string; categoryId?: string; categoryName?: string; priceCents?: number | null; link?: string; description?: string; status?: ItemStatus; discountCents?: unknown; quantity?: number; buyWeek?: number | null; tracking?: ItemTrackingInput; placement?: 'top' | 'end' }) {
  const created = await withTransaction(async client => {
    await requireEnxovalMember(client, input.userId, input.enxovalId);

    let category: EnxovalCategory | null = null;

    if (input.categoryId) {
      category = await findCategory(client, input.userId, input.enxovalId, input.categoryId);
      if (!category) throw new HttpError(404, 'Ambiente não encontrado.');
    } else if (input.categoryName) {
      category = await findOrCreateCategory(client, input.userId, input.enxovalId, input.categoryName);
    } else {
      throw new HttpError(400, 'Ambiente é obrigatório.');
    }
    await assertCanAddItem(client, input.enxovalId, category.id);

    // Item novo entra no topo da lista do ambiente (a importação de planilha pede "end" para manter a ordem das linhas).
    const orderResult = await client.query<{ next_order: number }>(`
      SELECT ${input.placement === 'end' ? 'COALESCE(MAX(sort_order), -1) + 1' : 'COALESCE(MIN(sort_order), 1) - 1'} AS next_order
      FROM items
      WHERE enxoval_id = $1 AND category_id = $2
    `, [input.enxovalId, category.id]);

    const itemId = randomUUID();
    const status = input.status ?? DEFAULT_ITEM_STATUS;
    const quantity = input.quantity ?? DEFAULT_ITEM_QUANTITY;
    const discount = resolveDiscountCents({ status, priceCents: input.priceCents ?? null, discountCents: input.discountCents });
    if ('error' in discount) throw new HttpError(400, discount.error);
    const tracking = input.tracking ?? {};
    const trackedProductId = tracking.trackedProductUrl
      ? await findOrCreateTrackedProduct(client, tracking.trackedProductUrl, input.name)
      : null;
    // O preço de referência é o do dia do cadastro: o informado no formulário ou, na falta dele, o preço do item.
    const initialPriceCents = trackedProductId ? (tracking.initialPriceCents ?? input.priceCents ?? null) : null;
    await client.query(`
      INSERT INTO items (
        id, user_id, enxoval_id, category_id, name, sort_order, price_cents, discount_cents, link, description, status, checked, quantity,
        tracked_product_id, initial_price_cents, target_price_cents, selected_variation, price_alert_enabled, price_basis, buy_week, purchased_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        CASE WHEN $11 = 'bought' THEN (now() AT TIME ZONE 'America/Sao_Paulo')::date END)
    `, [
      itemId, input.userId, input.enxovalId, category.id, input.name, orderResult.rows[0]?.next_order ?? 0, input.priceCents ?? null, discount.value, input.link ?? '', input.description ?? '', status, isDoneStatus(status), quantity,
      trackedProductId, initialPriceCents, trackedProductId ? (tracking.targetPriceCents ?? null) : null, tracking.selectedVariation ?? null, tracking.priceAlertEnabled ?? true, tracking.priceBasis ?? 'regular', input.buyWeek ?? null
    ]);
    if (trackedProductId) await syncPrimaryOffer(client, itemId);
    const { unresolved } = await linkItemsToCatalog(client, [{ id: itemId, name: input.name }]);

    return {
      item: await fetchItemRow(client, itemId, input.enxovalId),
      category,
      unresolved
    };
  });
  // Item que o catálogo ainda não conhece: a cascata completa (com o Jev) roda depois, sem segurar a resposta.
  queueResolution(created.unresolved);
  return { item: created.item, category: created.category };
}

async function updateItemForUser(userId: string, itemId: string, body: unknown) {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'Dados inválidos.');
  }

  let renamedTo: string | null = null;
  let unresolved: { id: string; name: string }[] = [];
  const updated = await withTransaction(async client => {
    // FOR UPDATE: situação, preço e desconto são validados em conjunto, então ninguém pode alterá-los no meio.
    const current = await client.query<{ enxoval_id: string; category_id: string; name: string; status: ItemStatus; price_cents: number | null; discount_cents: number; quantity: number; tracked_product_id: string | null; initial_price_cents: number | null; purchased_at: string | null; warranty_months: number | null; warranty_until: string | null }>(`
      SELECT i.enxoval_id, i.category_id, i.name, i.status, i.price_cents, i.discount_cents, i.quantity, i.tracked_product_id, i.initial_price_cents,
        to_char(i.purchased_at, 'YYYY-MM-DD') AS purchased_at, i.warranty_months, to_char(i.warranty_until, 'YYYY-MM-DD') AS warranty_until
      FROM items i
      INNER JOIN enxoval_members em ON em.enxoval_id = i.enxoval_id
      WHERE i.id = $1 AND em.user_id = $2
      LIMIT 1
      FOR UPDATE OF i
    `, [itemId, userId]);

    if (!current.rows[0]) throw new HttpError(404, 'Item não encontrado.');

    const enxovalId = current.rows[0].enxoval_id;
    const updates = body as Record<string, unknown>;
    const has = (key: string) => Object.prototype.hasOwnProperty.call(updates, key);
    const setClauses: string[] = [];
    const values: unknown[] = [];

    const addUpdate = (column: string, value: unknown) => {
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    };

    if (typeof updates.name === 'string') {
      const name = updates.name.trim();
      if (!name) throw new HttpError(400, 'Nome do item é obrigatório.');
      // Itens antigos podem ter nomes maiores: só barra quando o nome muda e passa do limite.
      if (name !== current.rows[0].name && name.length > MAX_ITEM_NAME_LENGTH)
        throw new HttpError(400, `O nome do item pode ter no máximo ${MAX_ITEM_NAME_LENGTH} caracteres.`);
      addUpdate('name', name);
      // Outro nome pode ser outro item: o vínculo com o catálogo é refeito depois de gravar.
      if (name !== current.rows[0].name) {
        addUpdate('catalog_item_id', null);
        renamedTo = name;
      }
    }

    let status = current.rows[0].status;
    if (has('status')) {
      if (!isItemStatus(updates.status)) throw new HttpError(400, 'Situação inválida.');
      status = updates.status;
    } else if (typeof updates.checked === 'boolean') {
      // Compatibilidade com o marcador antigo: mantém uma situação já coerente e só ajusta quando preciso.
      status = statusFromChecked(updates.checked, status);
    }
    if (has('status') || typeof updates.checked === 'boolean') {
      addUpdate('status', status);
      addUpdate('checked', isDoneStatus(status));
    }

    if (typeof updates.link === 'string') addUpdate('link', updates.link.trim());
    if (typeof updates.description === 'string') addUpdate('description', updates.description.trim());

    let priceCents = current.rows[0].price_cents === null ? null : Number(current.rows[0].price_cents);
    if (has('priceCents')) {
      if (updates.priceCents === null) {
        priceCents = null;
      } else if (typeof updates.priceCents === 'number' && Number.isInteger(updates.priceCents) && updates.priceCents >= 0) {
        priceCents = updates.priceCents;
      } else {
        throw new HttpError(400, 'Preço inválido.');
      }
      addUpdate('price_cents', priceCents);
    }

    let quantity = Number(current.rows[0].quantity ?? 1);
    if (has('quantity')) {
      if (!isValidQuantity(updates.quantity)) throw new HttpError(400, 'Quantidade inválida. Use um número inteiro de 1 a 999.');
      quantity = updates.quantity;
      addUpdate('quantity', quantity);
    }

    if (has('buyWeek')) addUpdate('buy_week', parseBuyWeek(updates.buyWeek));

    if (has('status') || has('priceCents') || has('discountCents') || typeof updates.checked === 'boolean') {
      const discount = resolveDiscountCents({
        status,
        priceCents,
        discountCents: has('discountCents') ? updates.discountCents : Number(current.rows[0].discount_cents)
      });
      if ('error' in discount) throw new HttpError(400, discount.error);
      addUpdate('discount_cents', discount.value);
    }

    if (typeof updates.categoryId === 'string') {
      const category = await findCategory(client, userId, enxovalId, updates.categoryId);
      if (!category) throw new HttpError(404, 'Ambiente não encontrado.');
      // Mover para outro ambiente conta como mais um item lá.
      if (updates.categoryId !== current.rows[0].category_id) await assertCanAddItem(client, enxovalId, updates.categoryId);
      addUpdate('category_id', updates.categoryId);
    }

    const tracking = parseTrackingInput(updates);
    if (tracking.trackedProductUrl) {
      const trackedProductId = await findOrCreateTrackedProduct(client, tracking.trackedProductUrl, current.rows[0].name);
      addUpdate('tracked_product_id', trackedProductId);
      // Passou a acompanhar agora: o preço de referência é o informado ou o preço atual do item.
      if (tracking.initialPriceCents === undefined && current.rows[0].initial_price_cents === null) addUpdate('initial_price_cents', priceCents);
    } else if (tracking.trackedProductUrl === null) {
      addUpdate('tracked_product_id', null);
    }
    if (tracking.initialPriceCents !== undefined) addUpdate('initial_price_cents', tracking.initialPriceCents);
    if (tracking.targetPriceCents !== undefined) addUpdate('target_price_cents', tracking.targetPriceCents);
    if (tracking.selectedVariation !== undefined) addUpdate('selected_variation', tracking.selectedVariation);
    if (tracking.priceBasis !== undefined) addUpdate('price_basis', tracking.priceBasis);
    if (tracking.priceAlertEnabled !== undefined) addUpdate('price_alert_enabled', tracking.priceAlertEnabled);
    // Mudou o alvo, o tipo de preço ou o produto: o último aviso enviado deixa de valer.
    if (tracking.targetPriceCents !== undefined || tracking.priceBasis !== undefined || tracking.trackedProductUrl !== undefined) addUpdate('last_alert_price_cents', null);

    // Parcelas, responsável, presente e garantia (Fase 11).
    const extras = await parseItemExtras(client, updates, {
      enxovalId,
      previousStatus: current.rows[0].status,
      status,
      statusChanged: has('status') || typeof updates.checked === 'boolean',
      purchasedAt: current.rows[0].purchased_at,
      warrantyMonths: current.rows[0].warranty_months === null ? null : Number(current.rows[0].warranty_months),
      warrantyUntil: current.rows[0].warranty_until,
    });
    for (const [column, value] of extras) addUpdate(column, value);

    if (setClauses.length === 0) {
      throw new HttpError(400, 'Nenhuma alteração enviada.');
    }

    values.push(itemId, enxovalId);
    const result = await client.query(`
      UPDATE items
      SET ${setClauses.join(', ')}, updated_at = now()
      WHERE id = $${values.length - 1} AND enxoval_id = $${values.length}
    `, values);

    if (!result.rowCount) throw new HttpError(404, 'Item não encontrado.');
    if (tracking.trackedProductUrl !== undefined) await syncPrimaryOffer(client, itemId);
    if (renamedTo) ({ unresolved } = await linkItemsToCatalog(client, [{ id: itemId, name: renamedTo }]));
    return fetchItemRow(client, itemId, enxovalId);
  });
  queueResolution(unresolved);
  return updated;
}
async function deleteItemForUser(userId: string, itemId: string) {
  const result = await getPool().query<{ id: string; enxoval_id: string }>(`
    DELETE FROM items i
    WHERE i.id = $1
      AND EXISTS (
        SELECT 1
        FROM enxoval_members em
        WHERE em.enxoval_id = i.enxoval_id
          AND em.user_id = $2
      )
    RETURNING id, enxoval_id
  `, [itemId, userId]);

  if (!result.rows[0]) throw new HttpError(404, 'Item não encontrado.');
}

async function reorderCategoriesForUser(userId: string, enxovalId: string, categoryIds: string[]) {
  return withTransaction(async client => {
    await requireEnxovalMember(client, userId, enxovalId);

    const uniqueCategoryIds = new Set(categoryIds);
    if (uniqueCategoryIds.size !== categoryIds.length) {
      throw new HttpError(400, 'Ambientes duplicados na ordenação.');
    }

    const existingResult = await client.query<{ id: string }>(`
      SELECT id
      FROM categories
      WHERE enxoval_id = $1
      ORDER BY sort_order ASC, name ASC
    `, [enxovalId]);

    const existingIds = new Set(existingResult.rows.map(category => category.id));
    const invalidCategoryId = categoryIds.find(categoryId => !existingIds.has(categoryId));
    if (invalidCategoryId) {
      throw new HttpError(400, 'A ordenação contém um ambiente inválido.');
    }

    const nextCategoryIds = [
      ...categoryIds,
      ...existingResult.rows
        .map(category => category.id)
        .filter(categoryId => !uniqueCategoryIds.has(categoryId))
    ];

    for (const [sortOrder, categoryId] of nextCategoryIds.entries()) {
      await client.query(`
        UPDATE categories
        SET sort_order = $1, updated_at = now()
        WHERE id = $2 AND enxoval_id = $3
      `, [sortOrder, categoryId, enxovalId]);
    }

    return fetchCategories(client, userId, enxovalId);
  });
}

export function registerApiRoutes(app: Express) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(protectMutationOrigin);
  router.use(enforceBans);
  router.use(asyncHandler(async (req, _res, next) => {
    if (/^\/(auth(?:\/|$)|profile(?:\/|$)|onboarding\/complete$|billing(?:\/|$)|admin(?:\/|$)|bootstrap$|health$|invitations(?:\/|$)|feedback(?:\/|$)|lifecycle\/returned$)/.test(req.path)) return next();
    // Older onboarding screens post the draft here. The handler saves it without granting access.
    if (req.method === 'POST' && req.path === '/enxovais' && req.body?.plan !== undefined) return next();
    const user = await requireCurrentUser(req);
    const candidate = req.query.enxovalId ?? req.body?.enxovalId ?? req.path.match(/^\/enxovais\/([^/]+)/)?.[1];
    if (typeof candidate === 'string') await requireEnxovalMember(getPool(), user.id, candidate);
    else if (user.plan === 'free') throw subscriptionRequired();
    next();
  }));
  registerAdminRoutes(router);
  registerProfileRoutes(router, requireCurrentUser);
  registerFeedbackRoutes(router, requireCurrentUser);
  registerAiRoutes(router, { requireUser: requireCurrentUser, fetchItems, fetchCategories });
  registerCatalogRoutes(router, { requireUser: requireCurrentUser });
  registerItemOfferRoutes(router, { requireUser: requireCurrentUser, requireEnxovalMember, fetchItemRow });
  registerItemDocumentRoutes(router, { requireUser: requireCurrentUser, requireEnxovalMember, fetchItemRow });

  // Foto de quem participa do enxoval (para o avatar do responsável pelo item). Só para quem está no mesmo enxoval.
  router.get('/enxovais/:id/members/:userId/avatar', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    await requireEnxovalMember(getPool(), user.id, req.params.id);
    const result = await getPool().query<{ avatar_data: Buffer | null }>(`
      SELECT u.avatar_data FROM enxoval_members em INNER JOIN users u ON u.id = em.user_id
      WHERE em.enxoval_id = $1 AND em.user_id = $2
    `, [req.params.id, req.params.userId]);
    const data = result.rows[0]?.avatar_data;
    if (!data) throw new HttpError(404, 'Foto não encontrada.');
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    res.send(data);
  }));
  registerBillingRoutes(router, {
    requireUser: requireCurrentUser,
    ensureDefaultEnxoval: userId => withTransaction(async client => {
      const limits = await assertCanCreateEnxoval(client, userId);
      const existing = await client.query<{ id: string }>('SELECT id FROM enxovais WHERE owner_id = $1 ORDER BY created_at, id LIMIT 1', [userId]);
      if (existing.rows[0]) return existing.rows[0].id;
      const saved = await client.query<{ onboarding_draft: { name: string; plan: EnxovalPlan; profile: OnboardingProfile } | null }>('SELECT onboarding_draft FROM users WHERE id = $1', [userId]);
      const draft = saved.rows[0]?.onboarding_draft;
      const id = await insertEnxoval(client, userId, draft?.name ?? 'Enxoval de Casa Nova', limits, draft ? { plan: draft.plan, profile: draft.profile } : { useDefaultTemplate: true });
      await client.query('UPDATE users SET onboarding_draft = NULL WHERE id = $1', [userId]);
      return id;
    })
  });

  router.post('/onboarding/complete', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    if (user.isGuest) throw new HttpError(403, 'Contas de convidados usam o enxoval do titular.');
    const name = normalizeEnxovalName(requireText(req.body?.name, 'Nome do enxoval'));
    const profile = parseOnboardingProfile(req.body?.profile);
    const plan = parseOnboardingPlan(req.body?.plan, profile.style === 'none', profile.rooms.length === 0);
    if (!plan) throw new HttpError(400, 'Conclua o planejamento antes de continuar.');
    const userName = parseUserName(req.body?.userName);
    await saveOnboardingDraft(user.id, name, plan, profile, userName);
    res.json({ completed: true });
  }));

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.get('/bootstrap', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req, true, true);
    const requestedEnxovalId = typeof req.query.enxovalId === 'string' ? req.query.enxovalId : undefined;
    res.json(await fetchBootstrap(user, requestedEnxovalId));
  }));

  router.post('/auth/register', asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const name = typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : email.split('@')[0];

    if (!email || !email.includes('@')) throw new HttpError(400, 'E-mail inválido.');
    const password = requireNewPassword(req.body?.password, 'Senha');

    const context = ensureDevice(req, res);
    await assertNotBlocked(getPool(), { ip: context.ip, deviceId: context.deviceId });

    // O cadastro cria só a conta. O primeiro enxoval (com ou sem o plano do funil /comecar)
    // é criado depois, autenticado, em POST /enxovais.
    const passwordHash = await hashPassword(password);
    const userId = randomUUID();
    const mustVerify = emailVerificationRequired();

    try {
      await withTransaction(async client => {
        await client.query(`
          INSERT INTO users (id, name, email, password_hash, last_login_at, email_verified_at)
          VALUES ($1, $2, $3, $4, now(), CASE WHEN $5 THEN NULL ELSE now() END)
        `, [userId, name, email, passwordHash, mustVerify]);
        await recordUserIpEvent(client, userId, context, 'signup');
        await saveSignupGrowth(client, userId, req.body, 'cadastro');
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new HttpError(409, 'Já existe uma conta com esse e-mail.');
      }
      throw err;
    }

    await createSession(res, userId);
    res.status(201).json(await fetchBootstrap(mapUser({ id: userId, name, email, plan: 'free', email_verified_at: mustVerify ? null : new Date() })));
    void checkSignupBurst(context.ip).catch(err =>
      getLogger().error({ event: 'security.signup_burst_check_failed', err }, 'Falha ao verificar rajada de cadastros.'));
    if (mustVerify) void issueEmailVerification(userId).catch(err =>
      getLogger().error({ event: 'email_verification.failed', err }, 'Falha ao enviar a confirmação de e-mail.'));
  }));

  router.post('/auth/login', loginRateLimit(), asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = requireText(req.body?.password, 'Senha');
    if (password.length > 512) throw new HttpError(400, 'Senha muito longa.');
    const context = ensureDevice(req, res);
    await assertNotBlocked(getPool(), { ip: context.ip, deviceId: context.deviceId });
    const user = await withTransaction(async client => {
      const result = await client.query<DbUserRow>(
        'SELECT * FROM users WHERE email = $1 LIMIT 1 FOR UPDATE', [email]);
      const row = result.rows[0];
      if (!row || !(await verifyPassword(password, row.password_hash))) return null;
      if (!row.is_active) throw new HttpError(403, 'Esta conta está inativa. Entre em contato com o suporte.');
      await assertNotBlocked(client, { userId: row.id });
      if (row.must_change_password && (!row.password_reset_expires_at || row.password_reset_expires_at.getTime() <= Date.now())) {
        throw new HttpError(401, 'Sua senha temporária expirou. Solicite uma nova ao suporte.');
      }
      await client.query('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()', [row.id]);
      await client.query('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);
      await recordUserIpEvent(client, row.id, context, 'login');
      await createSession(res, row.id, client);
      return mapUser(row);
    });
    if (!user) {
      await recordLoginFailure(context.ip);
      throw new HttpError(401, 'E-mail ou senha inválidos.');
    }
    res.json(await fetchBootstrap(user));
  }));

  router.post('/auth/change-password', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req, true, true);
    const password = requireNewPassword(req.body?.password, 'Nova senha');
    const confirmation = requireText(req.body?.confirmation, 'Confirmação da senha');
    if (password !== confirmation) throw new HttpError(400, 'As senhas não coincidem.');
    const updatedUser = await withTransaction(async client => {
      const result = await client.query<DbUserRow>(
        'SELECT * FROM users WHERE id = $1 FOR UPDATE', [user.id]);
      const row = result.rows[0];
      const tokenHash = hashSessionToken(getCookie(req, SESSION_COOKIE));
      const session = await client.query('SELECT id FROM sessions WHERE user_id = $1 AND token_hash = $2 AND expires_at > now()', [user.id, tokenHash]);
      if (!row?.is_active || !session.rowCount) throw new HttpError(401, 'Faça login novamente para continuar.');
      if (!row.must_change_password) throw new HttpError(409, 'Esta conta não possui uma troca de senha pendente.');
      if (!row.password_reset_expires_at || row.password_reset_expires_at.getTime() <= Date.now()) throw new HttpError(401, 'Sua senha temporária expirou. Solicite uma nova ao suporte.');
      if (await verifyPassword(password, row.password_hash)) throw new HttpError(400, 'Escolha uma senha diferente da temporária.');
      await client.query('UPDATE users SET password_hash = $2, must_change_password = false, password_reset_expires_at = NULL, updated_at = now() WHERE id = $1', [user.id, await hashPassword(password)]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
      await createSession(res, user.id, client);
      return mapUser({ ...row, must_change_password: false });
    });
    res.json(await fetchBootstrap(updatedUser));
  }));

  router.post('/auth/forgot-password', loginRateLimit(8), asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email || email.length > 254 || !email.includes('@')) throw new HttpError(400, 'Informe um e-mail válido.');
    // A resposta é a mesma exista ou não uma conta com esse e-mail: ninguém descobre quem tem cadastro.
    res.json({ ok: true });
    void issuePasswordReset(email).catch(err =>
      getLogger().error({ event: 'password_reset.failed', err }, 'Falha ao preparar a redefinição de senha.'));
  }));

  router.post('/auth/reset-password/check', loginRateLimit(30), asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (token.length < 20 || token.length > 200) {
      res.json({ valid: false });
      return;
    }
    const result = await getPool().query(
      `SELECT 1 FROM password_reset_tokens t INNER JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1 AND t.expires_at > now() AND u.is_active`,
      [hashSessionToken(token)]);
    res.json({ valid: Boolean(result.rowCount) });
  }));

  router.post('/auth/reset-password', loginRateLimit(10), asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const password = requireNewPassword(req.body?.password, 'Nova senha');
    const confirmation = requireText(req.body?.confirmation, 'Confirmação da senha');
    if (password !== confirmation) throw new HttpError(400, 'As senhas não coincidem.');
    if (token.length < 20 || token.length > 200) throw new HttpError(400, 'Este link expirou ou já foi usado. Peça um novo link de redefinição.');

    const user = await withTransaction(async client => {
      const result = await client.query<{ id: string; name: string; email: string }>(
        `SELECT u.id, u.name, u.email FROM password_reset_tokens t INNER JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = $1 AND t.expires_at > now() AND u.is_active
         FOR UPDATE OF t, u`,
        [hashSessionToken(token)]);
      const row = result.rows[0];
      if (!row) throw new HttpError(400, 'Este link expirou ou já foi usado. Peça um novo link de redefinição.');
      // O link chegou à caixa de entrada: o e-mail fica confirmado.
      await client.query(
        'UPDATE users SET password_hash = $2, must_change_password = false, password_reset_expires_at = NULL, email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1',
        [row.id, await hashPassword(password)]);
      // Quem tinha a sessão aberta (inclusive um invasor) é desconectado, e o link não serve de novo.
      await client.query('DELETE FROM sessions WHERE user_id = $1', [row.id]);
      await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [row.id]);
      return row;
    });
    res.json({ ok: true });
    void sendMail(passwordChangedEmail({ to: user.email, name: user.name })).catch(err =>
      getLogger().error({ event: 'password_changed.notification_failed', err }, 'Falha ao enviar o aviso de senha alterada.'));
  }));

  // Only explicit browser activity extends the idle window. Polling and reads never do.
  router.post('/auth/verify-email', loginRateLimit(30), asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const invalid = new HttpError(400, 'Este link de confirmação expirou ou já foi usado. Entre na sua conta para receber um novo.');
    if (token.length < 20 || token.length > 200) throw invalid;
    await withTransaction(async client => {
      const result = await client.query<{ user_id: string }>(
        `SELECT t.user_id FROM email_verification_tokens t INNER JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = $1 AND t.expires_at > now() AND u.is_active
         FOR UPDATE OF t, u`,
        [hashSessionToken(token)]);
      const row = result.rows[0];
      if (!row) throw invalid;
      await client.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1', [row.user_id]);
      await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [row.user_id]);
    });
    res.json({ ok: true });
  }));

  router.post('/auth/verify-email/resend', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req, true, true);
    if (user.emailVerified) {
      res.json({ ok: true, alreadyVerified: true });
      return;
    }
    if (!canDeliverMail()) throw new HttpError(503, 'Não foi possível enviar o e-mail de confirmação agora. Tente novamente mais tarde.');
    const result = await issueEmailVerification(user.id);
    if (result === 'cooldown') throw new HttpError(429, 'Acabamos de enviar um link. Aguarde um minuto antes de pedir outro.');
    res.json({ ok: true, alreadyVerified: result === 'verified' });
  }));

  router.post('/auth/activity', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req, true, true);
    const tokenHash = hashSessionToken(getCookie(req, SESSION_COOKIE));
    const updated = await getPool().query(`UPDATE sessions SET last_activity_at = now()
      WHERE token_hash = $1 AND expires_at > now()
        AND created_at > now() - interval '7 days'
        AND last_activity_at > now() - interval '48 hours'`, [tokenHash]);
    if (!updated.rowCount) throw new HttpError(401, 'Sua sessão expirou. Faça login novamente.');
    await recordActivityDay(getPool(), user.id);
    res.status(204).end();
  }));

  // Volta ao app pelo link de um e-mail (parâmetro `lm`): mede o retorno por fluxo de ciclo de vida. Fica fora do
  // bloqueio de assinatura: quem volta por um e-mail pode estar justamente sem plano ativo.
  router.post('/lifecycle/returned', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req, true, true);
    res.json({ recorded: await recordReturn(user.id, req.body?.messageId) });
  }));

  router.post('/auth/logout', asyncHandler(async (req, res) => {
    const token = getCookie(req, SESSION_COOKIE);
    if (token) {
      await getPool().query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
    }

    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.status(204).end();
  }));

  router.get('/enxovais/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    res.json(await fetchWorkspace(getPool(), user.id, req.params.id));
  }));

  router.post('/enxovais', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    if (user.isGuest) throw new HttpError(403, 'Contas de convidado usam apenas os enxovais para os quais foram convidadas.');
    const name = normalizeEnxovalName(requireText(req.body?.name, 'Nome do enxoval'));

    // O enxoval do funil /comecar chega com o plano gerado e as respostas; sem plano, segue o
    // fluxo normal de "criar novo enxoval" (com ou sem o template padrão).
    const profile = req.body?.plan != null ? parseOnboardingProfile(req.body?.profile) : null;
    const plan = parseOnboardingPlan(req.body?.plan, profile?.style === 'none', profile?.rooms.length === 0);
    const useDefaultTemplate = req.body?.useDefaultTemplate !== false;
    // O cadastro não pede o nome; o funil pergunta e ele chega aqui, junto do plano.
    const userName = plan ? parseUserName(req.body?.userName) : null;

    if (user.plan === 'free' && plan && profile) {
      await saveOnboardingDraft(user.id, name, plan, profile, userName);
      res.status(202).json({ completed: true, requiresCheckout: true });
      return;
    }

    const workspace = await createEnxovalForUser(user.id, name, { useDefaultTemplate, plan, profile, userName });
    res.status(201).json(workspace);
  }));
  router.patch('/enxovais/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const role = await requireEnxovalMember(getPool(), user.id, req.params.id);

    if (!req.body || typeof req.body !== 'object') {
      throw new HttpError(400, 'Dados inválidos.');
    }

    const updates = req.body as Record<string, unknown>;
    const setClauses: string[] = [];
    const values: unknown[] = [];

    const addUpdate = (column: string, value: unknown) => {
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    };

    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      if (role !== 'owner') throw new HttpError(403, 'Apenas o dono pode alterar esse enxoval.');
      addUpdate('name', normalizeEnxovalName(requireText(updates.name, 'Nome do enxoval')));
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'discountCents')) {
      if (typeof updates.discountCents !== 'number' || !Number.isInteger(updates.discountCents) || updates.discountCents < 0) {
        throw new HttpError(400, 'Desconto inválido.');
      }
      addUpdate('discount_cents', updates.discountCents);
    }

    // Planejamento (data da mudança, lugar e perfil de gasto) é decisão de quem é dono do enxoval.
    const has = (key: string) => Object.prototype.hasOwnProperty.call(updates, key);
    if (has('moveDate') || has('spendingTier') || has('state') || has('city') || has('monthlyBudgetCents')) {
      if (role !== 'owner') throw new HttpError(403, 'Apenas o dono pode alterar esse enxoval.');
    }
    if (has('moveDate')) {
      const raw = updates.moveDate;
      if (raw !== null && !isIsoDate(raw)) throw new HttpError(400, 'Data da mudança inválida.');
      addUpdate('move_date', raw);
    }
    if (has('monthlyBudgetCents')) {
      const raw = updates.monthlyBudgetCents;
      if (raw !== null && (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0 || raw > MAX_PRICE_CENTS)) throw new HttpError(400, 'Teto mensal inválido.');
      addUpdate('monthly_budget_cents', raw);
    }
    if (has('spendingTier')) {
      if (!isSpendingTier(updates.spendingTier)) throw new HttpError(400, 'Perfil de gasto inválido.');
      addUpdate('spending_tier', updates.spendingTier);
    }
    if (has('state') || has('city')) {
      // A cidade nunca contradiz o estado: trocar de estado sem informar cidade apaga a cidade anterior.
      const current = await getPool().query<{ state: string | null; city: string | null }>('SELECT state, city FROM enxovais WHERE id = $1', [req.params.id]);
      const state = has('state') ? updates.state : current.rows[0]?.state ?? null;
      const city = has('city') ? updates.city : has('state') && state !== current.rows[0]?.state ? null : current.rows[0]?.city ?? null;
      if (state !== null && (typeof state !== 'string' || !/^[A-Z]{2}$/.test(state))) throw new HttpError(400, 'Estado inválido.');
      if (city !== null && (typeof city !== 'string' || !cityById(city))) throw new HttpError(400, 'Cidade inválida.');
      if (city !== null && !cityMatchesState(city as string, state as string | null)) throw new HttpError(400, 'A cidade não pertence ao estado informado.');
      if (has('state')) addUpdate('state', state);
      if (has('city') || (has('state') && state !== current.rows[0]?.state)) addUpdate('city', city);
    }

    if (setClauses.length === 0) throw new HttpError(400, 'Nenhuma alteração enviada.');

    values.push(req.params.id);
    const result = await getPool().query<EnxovalRow>(`
      UPDATE enxovais
      SET ${setClauses.join(', ')}, updated_at = now()
      WHERE id = $${values.length}
      RETURNING id, name, owner_id, (SELECT name FROM users WHERE id = enxovais.owner_id) AS owner_name, discount_cents,
        to_char(move_date, 'YYYY-MM-DD') AS move_date, state, city, spending_tier, monthly_budget_cents, $${values.length + 1}::text AS role
    `, [...values, role]);

    if (!result.rows[0]) throw new HttpError(404, 'Enxoval não encontrado.');
    res.json(mapEnxoval(result.rows[0]));
  }));

  router.delete('/enxovais/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);

    await requireEnxovalOwner(getPool(), user.id, req.params.id);
    await getPool().query('DELETE FROM enxovais WHERE id = $1', [req.params.id]);

    res.status(204).end();
  }));

  // Convidar, revogar convites e remover participantes é só do dono: quem foi convidado apenas usa o enxoval (e pode sair dele).
  router.get('/enxovais/:id/invitations', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    await requireEnxovalOwner(getPool(), user.id, req.params.id);

    const result = await getPool().query<InvitationRow>(`
      SELECT id, email, created_at, expires_at
      FROM enxoval_invitations
      WHERE enxoval_id = $1 AND expires_at > now()
      ORDER BY created_at DESC
    `, [req.params.id]);

    res.json(result.rows.map(mapInvitation));
  }));

  router.post('/enxovais/:id/invitations', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const email = normalizeEmail(req.body?.email);
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new HttpError(400, 'E-mail inválido.');
    await requireEnxovalOwner(getPool(), user.id, req.params.id);
    if (email === user.email) throw new HttpError(409, 'Você já é o dono deste enxoval.');

    const base = appBaseUrl();
    if (!base || !canDeliverMail()) {
      getLogger().error({ event: 'invitation.configuration_missing' }, 'Convite: configure APP_URL, RESEND_API_KEY e MAIL_FROM para enviar o e-mail do convite.');
      throw new HttpError(503, 'O envio de e-mails não está configurado. Tente novamente mais tarde.');
    }

    const token = randomBytes(32).toString('base64url');
    const { invitation, enxovalName, accountExists } = await withTransaction(async client => {
      // Trava o enxoval para convites simultâneos respeitarem o limite e o intervalo de reenvio.
      const enxoval = await client.query<{ name: string }>('SELECT name FROM enxovais WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!enxoval.rows[0]) throw new HttpError(404, 'Enxoval não encontrado.');

      const existingUser = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
      const accountExists = Boolean(existingUser.rows[0]);
      if (existingUser.rows[0]) {
        const member = await client.query('SELECT 1 FROM enxoval_members WHERE enxoval_id = $1 AND user_id = $2', [req.params.id, existingUser.rows[0].id]);
        if (member.rowCount) throw new HttpError(409, 'Essa pessoa já participa deste enxoval.');
      }

      await client.query('DELETE FROM enxoval_invitations WHERE expires_at <= now()');
      const recent = await client.query(`
        SELECT 1 FROM enxoval_invitations
        WHERE enxoval_id = $1 AND email = $2 AND created_at > now() - make_interval(secs => $3)
      `, [req.params.id, email, INVITATION_RESEND_COOLDOWN_SECONDS]);
      if (recent.rowCount) throw new HttpError(429, 'Esse convite foi enviado há pouco. Aguarde um minuto para reenviar.');

      const pending = await client.query<{ n: number }>(`
        SELECT count(*)::int AS n FROM enxoval_invitations WHERE enxoval_id = $1 AND email <> $2
      `, [req.params.id, email]);
      if (pending.rows[0].n >= MAX_PENDING_INVITATIONS) {
        throw new HttpError(409, `Este enxoval já tem ${MAX_PENDING_INVITATIONS} convites pendentes. Cancele algum para convidar mais gente.`);
      }

      // Convidar de novo o mesmo e-mail troca o link anterior por um novo.
      const saved = await client.query<InvitationRow>(`
        INSERT INTO enxoval_invitations (id, enxoval_id, email, token_hash, invited_by, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (enxoval_id, email) DO UPDATE
          SET token_hash = EXCLUDED.token_hash, invited_by = EXCLUDED.invited_by,
              expires_at = EXCLUDED.expires_at, created_at = now()
        RETURNING id, email, created_at, expires_at
      `, [randomUUID(), req.params.id, email, hashSessionToken(token), user.id, new Date(Date.now() + INVITATION_TTL_MS)]);

      return { invitation: saved.rows[0], enxovalName: enxoval.rows[0].name, accountExists };
    });

    try {
      // O token vai no fragmento (#), que o navegador não envia ao servidor nem a outros sites pelo Referer.
      await sendMail(invitationEmail({
        to: email,
        inviterName: user.name,
        enxovalName,
        link: `${base}/convite#token=${token}`,
        days: INVITATION_TTL_DAYS,
        accountExists
      }));
    } catch (err) {
      await getPool().query('DELETE FROM enxoval_invitations WHERE id = $1', [invitation.id]);
      getLogger().error({ event: 'invitation.email_failed', err }, 'Falha ao enviar o e-mail do convite.');
      throw new HttpError(502, 'Não foi possível enviar o e-mail do convite. Tente novamente em instantes.');
    }

    res.status(201).json(mapInvitation(invitation));
  }));

  router.delete('/enxovais/:id/invitations/:invitationId', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    await requireEnxovalOwner(getPool(), user.id, req.params.id);

    const result = await getPool().query(
      'DELETE FROM enxoval_invitations WHERE id = $1 AND enxoval_id = $2',
      [req.params.invitationId, req.params.id]);
    if (!result.rowCount) throw new HttpError(404, 'Convite não encontrado.');

    res.status(204).end();
  }));

  router.delete('/enxovais/:id/members/:userId', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);

    // O convidado pode sair por conta própria; remover outra pessoa continua sendo só do dono.
    if (req.params.userId === user.id) {
      const role = await requireEnxovalMember(getPool(), user.id, req.params.id);
      if (role === 'owner') {
        throw new HttpError(400, 'O dono não pode sair do próprio enxoval. Para encerrá-lo, exclua o enxoval.');
      }

      // A sessão fica de pé: sem outro enxoval, o app mostra a tela "sem acesso" em vez de derrubar a conta.
      await getPool().query(
        'DELETE FROM enxoval_members WHERE enxoval_id = $1 AND user_id = $2 AND role <> \'owner\'',
        [req.params.id, user.id]);
      res.status(204).end();
      return;
    }

    await requireEnxovalOwner(getPool(), user.id, req.params.id);

    await withTransaction(async client => {
      const removed = await client.query(`
        DELETE FROM enxoval_members
        WHERE enxoval_id = $1 AND user_id = $2 AND role <> 'owner'
      `, [req.params.id, req.params.userId]);
      if (!removed.rowCount) throw new HttpError(404, 'Participante não encontrado.');

      // Convidado sem nenhum outro enxoval perde o acesso à plataforma na hora, inclusive nas sessões já abertas.
      // Quem tem enxoval próprio (conta avulsa) segue usando o dele normalmente.
      await client.query(`
        DELETE FROM sessions s
        USING users u
        WHERE s.user_id = u.id AND u.id = $1 AND u.is_guest
          AND NOT EXISTS (SELECT 1 FROM enxoval_members em WHERE em.user_id = u.id)
      `, [req.params.userId]);
    });

    res.status(204).end();
  }));

  router.post('/invitations/check', loginRateLimit(30), asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (token.length < 20 || token.length > 200) {
      res.json({ valid: false } satisfies InvitationPreview);
      return;
    }

    const result = await getPool().query<{ email: string; enxoval_name: string; inviter_name: string | null; account_exists: boolean }>(`
      SELECT i.email, e.name AS enxoval_name, inviter.name AS inviter_name,
        EXISTS (SELECT 1 FROM users u WHERE u.email = i.email) AS account_exists
      FROM enxoval_invitations i
      INNER JOIN enxovais e ON e.id = i.enxoval_id
      LEFT JOIN users inviter ON inviter.id = i.invited_by
      WHERE i.token_hash = $1 AND i.expires_at > now()
    `, [hashSessionToken(token)]);

    const row = result.rows[0];
    res.json(row
      ? { valid: true, email: row.email, enxovalName: row.enxoval_name, inviterName: row.inviter_name ?? 'Alguém', accountExists: row.account_exists } satisfies InvitationPreview
      : { valid: false } satisfies InvitationPreview);
  }));

  router.post('/invitations/accept', loginRateLimit(10), asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const expired = new HttpError(400, 'Este convite expirou ou já foi usado. Peça um novo convite a quem convidou você.');
    if (token.length < 20 || token.length > 200) throw expired;

    const signedIn = await getCurrentUser(req);
    const context = ensureDevice(req, res);
    await assertNotBlocked(getPool(), { userId: signedIn?.id, ip: context.ip, deviceId: context.deviceId });

    const accepted = await withTransaction(async client => {
      const invitation = await client.query<{ id: string; enxoval_id: string; email: string; invited_by: string | null }>(`
        SELECT id, enxoval_id, email, invited_by
        FROM enxoval_invitations
        WHERE token_hash = $1 AND expires_at > now()
        FOR UPDATE
      `, [hashSessionToken(token)]);
      const row = invitation.rows[0];
      if (!row) throw expired;

      const existing = await client.query<{ id: string; is_active: boolean }>('SELECT id, is_active FROM users WHERE email = $1 FOR UPDATE', [row.email]);
      let userId: string;

      if (existing.rows[0]) {
        // Conta que já existe (inclusive de dono de outro enxoval): só entra quem está logado nela.
        if (!signedIn) throw new HttpError(401, 'Entre na sua conta para aceitar o convite.');
        if (signedIn.id !== existing.rows[0].id) throw new HttpError(403, `Este convite é para ${row.email}. Saia da conta atual e entre com esse e-mail.`);
        if (!existing.rows[0].is_active) throw new HttpError(403, 'Esta conta está inativa. Entre em contato com o suporte.');
        userId = existing.rows[0].id;
        // O convite chegou a este e-mail: ele fica confirmado.
        await client.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [userId]);
        await recordDevice(client, userId, context);
      } else {
        // Primeiro acesso: cria uma conta de convidado, que não tem enxoval próprio.
        const password = requireNewPassword(req.body?.password, 'Senha');
        if (password !== req.body?.confirmation) throw new HttpError(400, 'As senhas não coincidem.');
        const name = typeof req.body?.name === 'string' && req.body.name.trim()
          ? req.body.name.trim().slice(0, 100)
          : row.email.split('@')[0];
        userId = randomUUID();
        await client.query(`
          INSERT INTO users (id, name, email, password_hash, is_guest, last_login_at, email_verified_at)
          VALUES ($1, $2, $3, $4, true, now(), now())
        `, [userId, name, row.email, await hashPassword(password)]);
        await recordUserIpEvent(client, userId, context, 'invitation_signup');
        await saveSignupGrowth(client, userId, req.body, 'convite');
        await createSession(res, userId, client);
      }

      await client.query(`
        INSERT INTO enxoval_members (enxoval_id, user_id, role, invited_by)
        VALUES ($1, $2, 'editor', $3)
        ON CONFLICT (enxoval_id, user_id) DO NOTHING
      `, [row.enxoval_id, userId, row.invited_by]);
      await client.query('DELETE FROM enxoval_invitations WHERE id = $1', [row.id]);

      const user = await client.query<DbUserRow>(`SELECT id, name, email, must_change_password, is_guest, email_verified_at, ${effectivePlanSql()} AS plan FROM users WHERE id = $1`, [userId]);
      return { user: mapUser(user.rows[0]), enxovalId: row.enxoval_id };
    }).catch(err => {
      // Alguém criou uma conta com esse e-mail entre a checagem e a gravação.
      if ((err as { code?: string }).code === '23505') {
        throw new HttpError(409, 'Já existe uma conta com esse e-mail. Entre nela para aceitar o convite.');
      }
      throw err;
    });

    res.json(await fetchBootstrap(accepted.user, accepted.enxovalId));
  }));

  router.get('/categories', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.query.enxovalId, 'Enxoval');
    res.json(await fetchCategories(getPool(), user.id, enxovalId));
  }));

  router.post('/categories', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const name = requireEnvironmentName(req.body?.name);
    const enxovalId = requireText(req.body?.enxovalId, 'Enxoval');

    const category = await withTransaction(client => findOrCreateCategory(client, user.id, enxovalId, name));
    res.status(201).json(category);
  }));

  router.patch('/categories/order', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.body?.enxovalId, 'Enxoval');
    const categoryIds = Array.isArray(req.body?.categoryIds) && req.body.categoryIds.every((categoryId: unknown) => typeof categoryId === 'string')
      ? req.body.categoryIds
      : null;

    if (!categoryIds) throw new HttpError(400, 'Ordenação inválida.');

    res.json(await reorderCategoriesForUser(user.id, enxovalId, categoryIds));
  }));

  router.patch('/categories/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.body?.enxovalId, 'Enxoval');
    const name = requireEnvironmentName(req.body?.name);
    await requireEnxovalMember(getPool(), user.id, enxovalId);
    try {
      const result = await getPool().query<CategoryRow>(
        'UPDATE categories SET name = $3, updated_at = now() WHERE id = $1 AND enxoval_id = $2 RETURNING id, name, sort_order',
        [req.params.id, enxovalId, name]);
      if (!result.rows[0]) throw new HttpError(404, 'Ambiente não encontrado.');
      res.json(mapCategory(result.rows[0]));
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'Já existe um ambiente com esse nome.');
      throw err;
    }
  }));

  router.delete('/categories/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.query.enxovalId, 'Enxoval');
    await requireEnxovalMember(getPool(), user.id, enxovalId);
    // Os itens do ambiente são removidos junto (ON DELETE CASCADE).
    const result = await getPool().query<{ id: string }>(
      'DELETE FROM categories WHERE id = $1 AND enxoval_id = $2 RETURNING id',
      [req.params.id, enxovalId]);
    if (!result.rows[0]) throw new HttpError(404, 'Ambiente não encontrado.');
    res.status(204).end();
  }));

  router.patch('/items/order', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.body?.enxovalId, 'Enxoval');
    const categoryId = requireText(req.body?.categoryId, 'Ambiente');
    const itemIds: string[] | null = Array.isArray(req.body?.itemIds) && req.body.itemIds.every((id: unknown) => typeof id === 'string') ? req.body.itemIds : null;
    if (!itemIds || new Set(itemIds).size !== itemIds.length) throw new HttpError(400, 'Ordenação inválida ou com itens duplicados.');
    const result = await withTransaction(async client => {
      await requireEnxovalMember(client, user.id, enxovalId);
      const category = await client.query('SELECT id FROM categories WHERE id = $1 AND enxoval_id = $2 FOR UPDATE', [categoryId, enxovalId]);
      if (!category.rowCount) throw new HttpError(404, 'Ambiente não encontrado.');
      const existing = await client.query<{ id: string }>('SELECT id FROM items WHERE enxoval_id = $1 AND category_id = $2 FOR UPDATE', [enxovalId, categoryId]);
      const actual = new Set(existing.rows.map(item => item.id));
      if (actual.size !== itemIds.length || itemIds.some(id => !actual.has(id))) throw new HttpError(409, 'A lista mudou. Atualize os itens antes de reordenar.');
      for (const [position, id] of itemIds.entries()) {
        await client.query('UPDATE items SET sort_order = $2 WHERE id = $1 AND enxoval_id = $3 AND category_id = $4', [id, position, enxovalId, categoryId]);
      }
      return (await fetchItems(client, user.id, enxovalId)).filter(item => item.categoryId === categoryId);
    });
    res.json(result);
  }));

  router.get('/items', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.query.enxovalId, 'Enxoval');
    res.json(await fetchItems(getPool(), user.id, enxovalId));
  }));

  router.post('/items', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const name = requireText(req.body?.name, 'Nome do item');
    if (name.length > MAX_ITEM_NAME_LENGTH) throw new HttpError(400, `O nome do item pode ter no máximo ${MAX_ITEM_NAME_LENGTH} caracteres.`);
    const enxovalId = requireText(req.body?.enxovalId, 'Enxoval');
    const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId : undefined;
    const categoryName = typeof req.body?.categoryName === 'string' && req.body.categoryName.trim()
      ? requireEnvironmentName(req.body.categoryName)
      : undefined;

    const rawPrice = req.body?.priceCents;
    if (rawPrice !== undefined && rawPrice !== null && !(typeof rawPrice === 'number' && Number.isInteger(rawPrice) && rawPrice >= 0)) {
      throw new HttpError(400, 'Preço inválido.');
    }
    const link = typeof req.body?.link === 'string' ? req.body.link.trim() : undefined;
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : undefined;
    const rawStatus = req.body?.status;
    if (rawStatus !== undefined && !isItemStatus(rawStatus)) throw new HttpError(400, 'Situação inválida.');
    const rawQuantity = req.body?.quantity;
    if (rawQuantity !== undefined && !isValidQuantity(rawQuantity)) throw new HttpError(400, 'Quantidade inválida. Use um número inteiro de 1 a 999.');

    const buyWeek = req.body?.buyWeek === undefined ? undefined : parseBuyWeek(req.body.buyWeek);

    const tracking = parseTrackingInput(req.body);
    const result = await createItemForUser({ userId: user.id, enxovalId, name, categoryId, categoryName, priceCents: rawPrice, link: link || tracking.trackedProductUrl || undefined, description, status: rawStatus, discountCents: req.body?.discountCents, quantity: rawQuantity, buyWeek, tracking, placement: req.body?.placement === 'end' ? 'end' : 'top' });
    res.status(201).json(result);
  }));

  router.patch('/items/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const item = await updateItemForUser(user.id, req.params.id, req.body);
    res.json(item);
  }));

  router.delete('/items/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    await deleteItemForUser(user.id, req.params.id);
    res.status(204).end();
  }));

  // Lê o link de um produto para preencher o formulário. Não cria nada: o item só nasce ao salvar.
  router.post('/products/extract', rateLimit(30, 10 * 60_000), asyncHandler(async (req, res) => {
    await requireCurrentUser(req);
    const url = requireText(req.body?.url, 'Link do produto');
    try {
      const preview = await scrapeProduct(url, { allowPartial: true });
      // Resultado parcial (só o nome tirado do link) não é um dado confiável da loja: não vira produto acompanhado.
      if (!preview.partial) rememberPreview(preview);
      // O catálogo sabe o cômodo de quase todo item; o regex de `suggestCategory` fica só como reserva.
      const catalogItem = preview.title ? await findItemInTitle(preview.title).catch(err => { getLogger().warn({ event: 'catalog.title.failed', title: preview.title, err }, 'Catalog title lookup failed.'); return null; }) : null;
      res.json({ ...preview, suggestedRoom: catalogItem?.room ?? null });
    } catch (err) {
      if (err instanceof ScrapeError) throw new HttpError(err.code === 'invalid_url' ? 400 : 422, err.message);
      throw err;
    }
  }));

  router.get('/items/:id/price-history', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const rawDays = Number(req.query.days ?? 60);
    const days = Number.isInteger(rawDays) ? Math.min(Math.max(rawDays, 7), 365) : 60;
    const itemResult = await getPool().query<{ tracked_product_id: string | null; initial_price_cents: number | null; target_price_cents: number | null; price_basis: PriceBasis; url: string | null; domain: string | null }>(`
      SELECT i.tracked_product_id, i.initial_price_cents, i.target_price_cents, i.price_basis, tp.url, tp.domain
      FROM items i
      INNER JOIN enxoval_members em ON em.enxoval_id = i.enxoval_id AND em.user_id = $2
      LEFT JOIN tracked_products tp ON tp.id = i.tracked_product_id
      WHERE i.id = $1
    `, [req.params.id, user.id]);
    const item = itemResult.rows[0];
    if (!item) throw new HttpError(404, 'Item não encontrado.');
    if (!item.tracked_product_id || !item.url) throw new HttpError(404, 'Este item não acompanha o preço de uma loja.');

    const snapshots = await getPool().query<{ captured_at: Date; price_cents: number; pix_price_cents: number | null }>(`
      SELECT captured_at, price_cents, pix_price_cents
      FROM product_price_snapshots
      WHERE tracked_product_id = $1 AND captured_at >= now() - ($2::int * interval '1 day')
      ORDER BY captured_at ASC
    `, [item.tracked_product_id, days]);

    const history: ItemPriceHistory = {
      points: snapshots.rows.map(row => ({
        date: serializeTimestamp(row.captured_at),
        priceCents: Number(row.price_cents),
        ...(row.pix_price_cents === null ? {} : { pixPriceCents: Number(row.pix_price_cents) })
      })),
      initialPriceCents: nullableCents(item.initial_price_cents),
      targetPriceCents: nullableCents(item.target_price_cents),
      priceBasis: item.price_basis,
      url: item.url,
      domain: item.domain ?? '',
      offers: await offerHistories(req.params.id, days, item.price_basis)
    };
    res.json(history);
  }));

  router.get('/enxovais/:id/savings-summary', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    res.json(computeSavings(await fetchItems(getPool(), user.id, req.params.id)));
  }));

  app.use('/api', router);

  app.use('/api', httpErrorHandler);

}
