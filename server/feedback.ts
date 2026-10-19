import { getLogger } from './logger.ts';
// Central de ajuda: recebe problemas, sugestões e outros assuntos de quem está logado e os guarda para a gestão ler.
// A pessoa envia (POST /api/feedback); quem administra lê, filtra e atualiza o andamento em /api/admin/feedback.
import { randomUUID } from 'node:crypto';
import type { Request, Router } from 'express';
import { getPool } from './database.ts';
import { requireAdmin } from './admin.ts';
import { appBaseUrl, canDeliverMail, feedbackNotificationEmail, sendMail } from './mailer.ts';
import { asyncHandler, HttpError, rateLimit } from './security.ts';
import {
  FEEDBACK_AREAS,
  FEEDBACK_FREQUENCIES,
  FEEDBACK_IMPORTANCES,
  FEEDBACK_KIND_INFO,
  FEEDBACK_SEVERITIES,
  FEEDBACK_STATUSES,
  imageMatchesType,
  validateFeedback,
  type AdminFeedback,
  type FeedbackInput,
  type FeedbackStatus,
  type FeedbackTech
} from '../src/feedback.ts';
import type { AuthUser } from '../src/types.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FeedbackRow {
  id: string;
  created_at: Date;
  status: FeedbackStatus;
  kind: AdminFeedback['kind'];
  title: string;
  description: string;
  area: AdminFeedback['area'];
  steps: string;
  expected: string;
  frequency: AdminFeedback['frequency'];
  severity: AdminFeedback['severity'];
  problem: string;
  importance: AdminFeedback['importance'];
  contact_ok: boolean;
  contact_email: string;
  user_name: string;
  user_email: string;
  tech: FeedbackTech | null;
  has_screenshot: boolean;
}

function mapRow(row: FeedbackRow): AdminFeedback {
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    status: row.status,
    kind: row.kind,
    title: row.title,
    description: row.description,
    area: row.area,
    steps: row.steps,
    expected: row.expected,
    frequency: row.frequency,
    severity: row.severity,
    problem: row.problem,
    importance: row.importance,
    contactOk: row.contact_ok,
    contactEmail: row.contact_email,
    userName: row.user_name,
    userEmail: row.user_email,
    tech: row.tech,
    hasScreenshot: row.has_screenshot
  };
}

const labelOf = <T extends string>(list: readonly { id: T; label: string }[], id: T | null | undefined) =>
  list.find(item => item.id === id)?.label ?? '';

/** Texto legível da mensagem, para o aviso por e-mail. */
function describe(input: FeedbackInput) {
  const lines: { label: string; value: string }[] = [{ label: 'Resumo', value: input.title }];
  if (input.area) lines.push({ label: 'Onde', value: labelOf(FEEDBACK_AREAS, input.area) });
  if (input.severity) lines.push({ label: 'O quanto atrapalha', value: labelOf(FEEDBACK_SEVERITIES, input.severity) });
  if (input.frequency) lines.push({ label: 'Com que frequência', value: labelOf(FEEDBACK_FREQUENCIES, input.frequency) });
  if (input.importance) lines.push({ label: 'Importância', value: labelOf(FEEDBACK_IMPORTANCES, input.importance) });
  lines.push({ label: input.kind === 'bug' ? 'O que aconteceu' : 'Mensagem', value: input.description });
  if (input.steps) lines.push({ label: 'Passo a passo', value: input.steps });
  if (input.expected) lines.push({ label: 'O que esperava', value: input.expected });
  if (input.problem) lines.push({ label: 'Que dificuldade resolve', value: input.problem });
  if (input.tech) {
    const tech = [input.tech.path, input.tech.viewport, input.tech.language, input.tech.userAgent].filter(Boolean).join(' · ');
    if (tech) lines.push({ label: 'Informações técnicas', value: tech });
  }
  if (input.screenshot) lines.push({ label: 'Captura de tela', value: 'Anexada (disponível no painel).' });
  return lines;
}

/** Avisa a gestão por e-mail, sem nunca atrapalhar quem enviou: a mensagem já está salva. */
async function notify(input: FeedbackInput, user: AuthUser) {
  const to = process.env.FEEDBACK_TO_EMAIL?.trim();
  if (!to || !canDeliverMail()) return;
  try {
    const base = appBaseUrl();
    await sendMail(
      feedbackNotificationEmail({
        to,
        kindLabel: FEEDBACK_KIND_INFO[input.kind].short,
        title: input.title,
        userName: user.name,
        userEmail: user.email,
        replyTo: user.email,
        lines: describe(input),
        link: base ? `${base}/admin` : null
      })
    );
  } catch (error) {
    getLogger().error({ event: 'feedback.notification_failed', err: error }, 'Aviso de nova mensagem da central de ajuda não enviado.');
  }
}

export function registerFeedbackRoutes(router: Router, requireUser: (req: Request) => Promise<AuthUser>) {
  // 8 envios (contando os que voltam com erro de preenchimento) a cada 10 minutos por endereço: sobra para quem tem muito a dizer e barra quem despeja.
  router.post(
    '/feedback',
    rateLimit(8, 10 * 60_000, 'Você enviou várias mensagens seguidas. Aguarde alguns minutos para mandar outra.'),
    asyncHandler(async (req, res) => {
      const user = await requireUser(req);
      const { value, errors } = validateFeedback({ ...req.body, contactOk: true, contactEmail: user.email });
      if (!value) {
        const first = Object.values(errors)[0] ?? 'Confira os campos da mensagem.';
        throw new HttpError(400, first);
      }

      let screenshot: Buffer | null = null;
      if (value.screenshot) {
        screenshot = Buffer.from(value.screenshot.data, 'base64');
        if (screenshot.length === 0 || !imageMatchesType(screenshot, value.screenshot.type)) {
          throw new HttpError(400, 'Não foi possível usar essa imagem. Tente uma captura menor.');
        }
      }

      const id = randomUUID();
      await getPool().query(
        `INSERT INTO feedback (
           id, user_id, user_name, user_email, kind, title, description, area, steps, expected, problem,
           frequency, severity, importance, contact_ok, contact_email, tech, screenshot, screenshot_type
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19)`,
        [
          id, user.id, user.name, user.email, value.kind, value.title, value.description, value.area ?? null,
          value.steps ?? '', value.expected ?? '', value.problem ?? '',
          value.frequency ?? null, value.severity ?? null, value.importance ?? null,
          value.contactOk, value.contactEmail ?? '', value.tech ? JSON.stringify(value.tech) : null,
          screenshot, value.screenshot?.type ?? null
        ]
      );

      // O e-mail vai depois da resposta: a pessoa não espera o provedor de e-mail.
      res.status(201).json({ id });
      void notify(value, user);
    })
  );

  const LIST_COLUMNS = `
    id, created_at, status, kind, title, description, area, steps, expected, frequency, severity, problem,
    importance, contact_ok, contact_email, user_name, user_email, tech, (screenshot IS NOT NULL) AS has_screenshot`;

  router.get(
    '/admin/feedback',
    asyncHandler(async (req, res) => {
      await requireAdmin(req);
      const result = await getPool().query<FeedbackRow>(
        `SELECT ${LIST_COLUMNS} FROM feedback ORDER BY created_at DESC LIMIT 300`
      );
      res.json({ feedback: result.rows.map(mapRow) });
    })
  );

  router.patch(
    '/admin/feedback/:id',
    asyncHandler(async (req, res) => {
      await requireAdmin(req);
      const id = String(req.params.id);
      if (!UUID.test(id)) throw new HttpError(404, 'Mensagem não encontrada.');
      const status = req.body?.status;
      if (typeof status !== 'string' || !(FEEDBACK_STATUSES as readonly string[]).includes(status)) {
        throw new HttpError(400, 'Situação inválida.');
      }
      const result = await getPool().query<FeedbackRow>(
        `UPDATE feedback SET status = $1 WHERE id = $2 RETURNING ${LIST_COLUMNS}`,
        [status, id]
      );
      if (!result.rows[0]) throw new HttpError(404, 'Mensagem não encontrada.');
      res.json(mapRow(result.rows[0]));
    })
  );

  router.get(
    '/admin/feedback/:id/screenshot',
    asyncHandler(async (req, res) => {
      await requireAdmin(req);
      const id = String(req.params.id);
      if (!UUID.test(id)) throw new HttpError(404, 'Imagem não encontrada.');
      const result = await getPool().query<{ screenshot: Buffer | null; screenshot_type: string | null }>(
        'SELECT screenshot, screenshot_type FROM feedback WHERE id = $1',
        [id]
      );
      const row = result.rows[0];
      if (!row?.screenshot || !row.screenshot_type) throw new HttpError(404, 'Imagem não encontrada.');
      // Imagem enviada por terceiros: nunca é interpretada como página.
      res.set({ 'Content-Type': row.screenshot_type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
      res.send(row.screenshot);
    })
  );
}
