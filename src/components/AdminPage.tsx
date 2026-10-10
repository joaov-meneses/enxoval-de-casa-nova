import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserRoundX,
  Users,
} from "lucide-react";
import {
  adminLogin,
  adminLogout,
  adminSession,
  ApiError,
  fetchAdminUsers,
  resetUserPassword,
  setUserActive,
} from "../api";
import type { AdminUser } from "../types";
import { Brand } from "./Brand";
import { Dialog } from "./Dialog";

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Ainda não entrou";
type Action = { user: AdminUser; kind: "reset" | "status" };

export function AdminPage() {
  const [session, setSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "reset">(
    "all",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [temporary, setTemporary] = useState<{
    temporaryPassword: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const temporaryRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (temporary) temporaryRef.current?.focus();
  }, [temporary]);
  const handleError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      setError(err.message);
      setSession(null);
      setUsers([]);
      setAction(null);
      setTemporary(null);
      window.history.replaceState({}, "", "/admin/login");
    }
    return err instanceof Error
      ? err.message
      : "Não foi possível concluir a operação.";
  }, []);
  useEffect(() => {
    let mounted = true;
    adminSession()
      .then((data) => {
        if (mounted) setSession(data.login);
      })
      .catch((err) => {
        if (mounted && (!(err instanceof ApiError) || err.status !== 401))
          setError(handleError(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [handleError]);
  useEffect(() => {
    document.title = `${session ? "Gestão de usuários" : "Acesso administrativo"} | Casa Mia`;
    if (!session) return;
    let mounted = true;
    setRefreshing(true);
    fetchAdminUsers()
      .then((data) => {
        if (mounted) setUsers(data.users);
      })
      .catch((err) => {
        if (mounted) setError(handleError(err));
      })
      .finally(() => {
        if (mounted) setRefreshing(false);
      });
    return () => {
      mounted = false;
    };
  }, [session, handleError]);
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await adminLogin(login, password);
      setPassword("");
      setSession(data.login);
      window.history.replaceState({}, "", "/admin");
    } catch (err) {
      setError(handleError(err));
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await adminLogout();
      setSession(null);
      setUsers([]);
      setAction(null);
      setTemporary(null);
      window.history.replaceState({}, "", "/admin/login");
    } catch (err) {
      setError(handleError(err));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      setUsers((await fetchAdminUsers()).users);
    } catch (err) {
      setError(handleError(err));
    } finally {
      setRefreshing(false);
    }
  }
  function openAction(user: AdminUser, kind: Action["kind"]) {
    setDialogError("");
    setTemporary(null);
    setCopied(false);
    setAction({ user, kind });
  }
  async function confirmAction() {
    if (!action) return;
    setBusy(true);
    setDialogError("");
    try {
      if (action.kind === "reset") {
        const result = await resetUserPassword(action.user.id);
        setTemporary(result);
        setUsers((current) =>
          current.map((user) =>
            user.id === action.user.id
              ? {
                  ...user,
                  mustChangePassword: true,
                  passwordResetExpiresAt: result.expiresAt,
                }
              : user,
          ),
        );
      } else {
        await setUserActive(action.user.id, !action.user.isActive);
        setUsers((current) =>
          current.map((user) =>
            user.id === action.user.id
              ? { ...user, isActive: !user.isActive }
              : user,
          ),
        );
        setAction(null);
      }
    } catch (err) {
      setDialogError(handleError(err));
    } finally {
      setBusy(false);
    }
  }
  async function copyPassword() {
    if (!temporary) return;
    try {
      await navigator.clipboard.writeText(temporary.temporaryPassword);
      setCopied(true);
      setDialogError("");
    } catch {
      setDialogError("Selecione a senha no campo acima e copie manualmente.");
    }
  }
  if (loading)
    return (
      <main className="account-access-page">
        <Brand />
        <p role="status">Carregando gestão…</p>
      </main>
    );
  if (!session)
    return (
      <main className="account-access-page">
        <a className="account-access-brand" href="/">
          <Brand />
        </a>
        <section
          className="account-access-card"
          aria-labelledby="admin-login-title"
        >
          <span className="account-access-icon">
            <ShieldCheck size={26} aria-hidden="true" />
          </span>
          <span className="eyebrow">CUIDADO COM CADA CONTA</span>
          <h1 id="admin-login-title">Acesso administrativo.</h1>
          <p>
            Entre para gerenciar usuários e ajudar quem precisa recuperar o
            acesso.
          </p>
          <form className="auth-form" onSubmit={signIn} aria-busy={busy}>
            <label htmlFor="admin-login">
              Login administrativo
              <input
                id="admin-login"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                autoComplete="username"
                required
                maxLength={200}
                disabled={busy}
                placeholder="Seu login de gestão"
              />
            </label>
            <label htmlFor="admin-password">
              Senha administrativa
              <span className="password-field">
                <input
                  id="admin-password"
                  type={visible ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  maxLength={512}
                  disabled={busy}
                />
                <button
                  type="button"
                  aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button
              className="button button-dark"
              disabled={busy}
              type="submit"
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <>
                  Entrar na gestão <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <a className="account-signout" href="/login">
            <ArrowLeft size={16} /> Voltar ao login do aplicativo
          </a>
        </section>
        <p className="account-access-footer">Seu lar, tomando forma.</p>
      </main>
    );
  const counts = {
    all: users.length,
    active: users.filter((user) => user.isActive).length,
    inactive: users.filter((user) => !user.isActive).length,
    reset: users.filter((user) => user.mustChangePassword).length,
  };
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = users.filter(
    (user) =>
      (filter === "all" ||
        (filter === "active" && user.isActive) ||
        (filter === "inactive" && !user.isActive) ||
        (filter === "reset" && user.mustChangePassword)) &&
      `${user.name} ${user.email}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalized),
  );
  return (
    <div className="admin-page">
      <header className="admin-header">
        <a href="/" className="brand-link">
          <Brand />
        </a>
        <div>
          <span className="admin-session-label">
            <ShieldCheck size={16} /> {session}
          </span>
          <button
            className="button button-outline"
            onClick={() => void signOut()}
            disabled={busy}
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </header>
      <main className="admin-main">
        <section className="admin-intro">
          <div>
            <span className="eyebrow">GESTÃO SIMPLIFICADA</span>
            <h1>Cuidado com cada acesso.</h1>
            <p>Encontre uma conta, acompanhe seu status e ajude a recomeçar.</p>
          </div>
          <button
            className="button button-outline"
            onClick={() => void refresh()}
            disabled={refreshing || busy}
          >
            <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />{" "}
            Atualizar
          </button>
        </section>
        <div className="admin-summary">
          <div>
            <Users size={22} />
            <span>
              Usuários cadastrados<strong>{counts.all}</strong>
            </span>
          </div>
          <div>
            <UserCheck size={22} />
            <span>
              Contas ativas<strong>{counts.active}</strong>
            </span>
          </div>
          <div>
            <UserRoundX size={22} />
            <span>
              Contas inativas<strong>{counts.inactive}</strong>
            </span>
          </div>
        </div>
        <section
          className="admin-users"
          aria-labelledby="users-title"
          aria-busy={refreshing}
        >
          <div className="admin-users-heading">
            <h2 id="users-title">Usuários</h2>
            <label className="admin-search">
              <Search size={18} aria-hidden="true" />
              <input
                aria-label="Buscar usuários"
                type="search"
                placeholder="Busque por nome ou e-mail"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <div
            className="admin-filters"
            role="group"
            aria-label="Filtrar usuários"
          >
            {(
              [
                ["all", "Todos"],
                ["active", "Ativos"],
                ["inactive", "Inativos"],
                ["reset", "Troca pendente"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
                <span>{counts[value]}</span>
              </button>
            ))}
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="admin-user-list">
            {filtered.map((user) => (
              <article className="admin-user-row" key={user.id}>
                <div className="admin-user-identity">
                  <span className="admin-avatar" aria-hidden="true">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <h3>{user.name}</h3>
                    <p>{user.email}</p>
                    <small>
                      Cadastrado em{" "}
                      {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                    </small>
                  </div>
                </div>
                <div className="admin-user-status">
                  <span
                    className={`admin-badge ${user.isActive ? "active" : "inactive"}`}
                  >
                    {user.isActive ? "Ativo" : "Inativo"}
                  </span>
                  {user.mustChangePassword && (
                    <span className="admin-badge pending">
                      {user.passwordResetExpiresAt &&
                      new Date(user.passwordResetExpiresAt).getTime() <=
                        Date.now()
                        ? "Senha temporária expirada"
                        : "Troca de senha pendente"}
                    </span>
                  )}
                </div>
                <div className="admin-user-activity">
                  <span>
                    Último acesso<strong>{date(user.lastLoginAt)}</strong>
                  </span>
                  <small>
                    {user.workspaceCount}{" "}
                    {user.workspaceCount === 1 ? "enxoval" : "enxovais"}
                  </small>
                </div>
                <div className="admin-user-actions">
                  <button
                    className="button button-outline"
                    disabled={!user.isActive || busy}
                    onClick={() => openAction(user, "reset")}
                    aria-label={`Redefinir senha de ${user.email}`}
                  >
                    <KeyRound size={16} /> Redefinir senha
                  </button>
                  <button
                    className="admin-status-action"
                    disabled={busy}
                    onClick={() => openAction(user, "status")}
                    aria-label={`${user.isActive ? "Desativar" : "Reativar"} ${user.email}`}
                  >
                    {user.isActive ? "Desativar conta" : "Reativar conta"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <div className="admin-empty">
              <Users size={28} />
              <h3>
                {refreshing
                  ? "Carregando usuários…"
                  : "Nenhum usuário encontrado"}
              </h3>
              <p>
                {query || filter !== "all"
                  ? "Tente outra busca ou selecione Todos."
                  : "As contas criadas no aplicativo aparecerão aqui."}
              </p>
            </div>
          )}
          <p className="admin-list-note">
            {filtered.length} de {users.length} usuários · Contas inativas
            mantêm seus itens e listas.
          </p>
        </section>
      </main>
      <Dialog
        isOpen={Boolean(action)}
        title={
          temporary
            ? "Senha temporária pronta"
            : action?.kind === "reset"
              ? "Redefinir senha"
              : action?.user.isActive
                ? "Desativar conta"
                : "Reativar conta"
        }
        busy={busy}
        tone={
          action?.kind === "status" && action.user.isActive
            ? "danger"
            : "default"
        }
        onClose={() => {
          setAction(null);
          setTemporary(null);
        }}
      >
        {action && (
          <div className="admin-dialog-content">
            <p className="admin-dialog-user">
              <strong>{action.user.name}</strong>
              <span>{action.user.email}</span>
            </p>
            {temporary ? (
              <>
                <p>
                  Envie esta senha diretamente à pessoa. Ela precisará escolher
                  uma nova senha antes de acessar o enxoval.
                </p>
                <label
                  className="admin-temporary-label"
                  htmlFor="temporary-password"
                >
                  Senha temporária
                  <input
                    id="temporary-password"
                    ref={temporaryRef}
                    readOnly
                    value={temporary.temporaryPassword}
                    autoComplete="off"
                    spellCheck={false}
                    onFocus={(event) => event.target.select()}
                  />
                </label>
                <button
                  className="button button-outline admin-copy"
                  onClick={() => void copyPassword()}
                >
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                  {copied ? "Senha copiada" : "Copiar senha"}
                </button>
                <p className="admin-temporary-note">
                  Válida até {date(temporary.expiresAt)}. Esta senha aparece
                  apenas agora; ao fechar, será necessário gerar outra se você
                  não a copiou.
                </p>
                {dialogError && (
                  <div className="form-error" role="alert">
                    {dialogError}
                  </div>
                )}
                <button
                  className="button button-dark"
                  onClick={() => {
                    setAction(null);
                    setTemporary(null);
                  }}
                >
                  Já copiei, concluir
                </button>
              </>
            ) : (
              <>
                <p>
                  {action.kind === "reset"
                    ? "A senha atual será substituída por uma senha temporária válida por 24 horas. Os acessos anteriores serão encerrados. Os itens e listas serão preservados."
                    : action.user.isActive
                      ? "A pessoa não poderá entrar e suas sessões serão encerradas. Os itens e listas continuam salvos, e você pode reativar a conta depois."
                      : "A pessoa poderá entrar novamente. Se a senha temporária expirou, gere uma nova após reativar."}
                </p>
                {dialogError && (
                  <div className="form-error" role="alert">
                    {dialogError}
                  </div>
                )}
                <div className="admin-dialog-actions">
                  <button
                    className="button button-outline"
                    data-dialog-autofocus
                    disabled={busy}
                    onClick={() => setAction(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    className={`button ${action.kind === "status" && action.user.isActive ? "admin-danger-button" : "button-dark"}`}
                    disabled={busy}
                    onClick={() => void confirmAction()}
                  >
                    {busy ? (
                      <LoaderCircle size={18} className="animate-spin" />
                    ) : action.kind === "reset" ? (
                      "Gerar senha temporária"
                    ) : action.user.isActive ? (
                      "Desativar conta"
                    ) : (
                      "Reativar conta"
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
