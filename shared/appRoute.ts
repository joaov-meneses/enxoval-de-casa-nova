/** Routes identify both the workspace and its screen. Legacy URLs remain valid. */
export type WorkspaceView = "list" | "overview" | "plan" | "store";
export type AppRoute = {
  view: WorkspaceView;
  categoryId: string;
  enxovalId?: string;
};

export const APP_ROUTE_PATTERN = /^\/app(?:\/|$)/;
export const isAppPath = (pathname: string) => APP_ROUTE_PATTERN.test(pathname);
const home = (): AppRoute => ({ view: "list", categoryId: "" });

function decodeId(segment: string) {
  const id = decodeURIComponent(segment);
  if (!id || /[/\\\u0000-\u001f\u007f]/.test(id) || id === "." || id === "..")
    throw new Error("Invalid route ID");
  return id;
}

export function parseAppRoute(pathname: string): AppRoute | null {
  if (!isAppPath(pathname)) return null;
  const segments = pathname.split("/").filter(Boolean).slice(1);
  let enxovalId: string | undefined;
  try {
    if (segments[0] && !["itens", "meu-lar", "plano", "loja"].includes(segments[0])) {
      enxovalId = decodeId(segments.shift()!);
    }
    const [section, id] = segments;
    let route = home();
    if (section === "meu-lar" && segments.length === 1) route.view = "overview";
    else if (section === "plano" && segments.length === 1) route.view = "plan";
    else if (section === "itens" && id && segments.length === 2)
      route.categoryId = decodeId(id);
    // Modo loja (Fase 11.6): /loja mostra todos os ambientes; /loja/:ambiente, só um.
    else if (section === "loja" && segments.length <= 2) {
      route.view = "store";
      if (id) route.categoryId = decodeId(id);
    }
    return enxovalId ? { ...route, enxovalId } : route;
  } catch {
    return enxovalId ? { ...home(), enxovalId } : home();
  }
}

export function appRoutePath({ view, categoryId, enxovalId }: AppRoute) {
  const base = enxovalId ? `/app/${encodeURIComponent(enxovalId)}` : "/app";
  if (view === "overview") return `${base}/meu-lar`;
  if (view === "plan") return `${base}/plano`;
  if (view === "store") return categoryId ? `${base}/loja/${encodeURIComponent(categoryId)}` : `${base}/loja`;
  return categoryId ? `${base}/itens/${encodeURIComponent(categoryId)}` : base;
}

/** Analytics receives templates, never workspace or room identifiers. */
export function appRouteTemplate(pathname: string) {
  const route = parseAppRoute(pathname);
  if (!route) return null;
  const base = route.enxovalId ? "/app/:enxoval" : "/app";
  if (route.view === "overview") return `${base}/meu-lar`;
  if (route.view === "plan") return `${base}/plano`;
  if (route.view === "store") return route.categoryId ? `${base}/loja/:ambiente` : `${base}/loja`;
  return route.categoryId ? `${base}/itens/:ambiente` : base;
}

/** Checkout only accepts recognized local app paths, without queries or fragments. */
export function checkoutReturnPath(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[?#\\\u0000-\u0020\u007f]/.test(value)
  )
    return "/app";
  const route = parseAppRoute(value);
  return route && appRoutePath(route) === value ? value : "/app";
}
