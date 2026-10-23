import React,{
useCallback,
useEffect,
useMemo,
useRef,
useState,
} from "react";
import {
appRoutePath,
isAppPath,
parseAppRoute,
type AppRoute,
type WorkspaceView,
} from "../appRoute";
import { SESSION_EXPIRED_EVENT } from "../sessionActivity";
import { clearSubscriptionStatus } from "../subscriptionStatus";

import {
ApiError,
createCategory as createCategoryRequest,
createEnxoval as createEnxovalRequest,
createItem as createItemRequest,
deleteCategory as deleteCategoryRequest,
deleteEnxoval as deleteEnxovalRequest,
deleteItem as deleteItemRequest,
fetchBootstrap,
fetchEnxoval as fetchEnxovalRequest,
fetchInvitations as fetchInvitationsRequest,
inviteMember as inviteMemberRequest,
logout as logoutRequest,
removeMember as removeMemberRequest,
renameCategory as renameCategoryRequest,
reorderCategories as reorderCategoriesRequest,
reorderItems as reorderItemsRequest,
revokeInvitation as revokeInvitationRequest,
syncBilling,
updateEnxoval as updateEnxovalRequest,
updateItem as updateItemRequest,
} from "../api";
import { ItemRow } from "../components/ItemRow";
import { pickNextStep } from "../components/NextStepCard";
import { type PlanningUpdates } from "../components/PurchasePlan";
import { type UndoToastMessage } from "../components/UndoToast";
import { normalizeEnvironmentName } from "../data";
import { readStoredEnxovalId,storeEnxovalId } from "../enxovais";
import { useNinoCelebration } from "../hooks/useNinoCelebration";
import {
DEFAULT_ITEM_STATUS,
activeItems,
discountApplies,
doneItems,
isDoneStatus,
isItemStatus,
isPendingStatus,
sumBought,
sumItemDiscounts,
sumReceived,
withStatusUpdate,
type ItemStatus,
} from "../itemStatus";
import {
QUICK_FILTER_TITLE,
buyWeekRank,
computeListInsights,
dealIds,
groupByBuyWeek,
isBoughtWithoutPrice,
matchesAssignee,
matchesQuickFilter,
roomSuggestions,
thisWeekIds,
type AssigneeFilter,
type QuickFilter,
} from "../listInsights";
import { buildPurchasePlan } from "../planning/purchasePlan";
import type {
AuthUser,
BootstrapData,
EnxovalCategory,
EnxovalInvitation,
EnxovalItem,
EnxovalMember,
EnxovalSummary,
EnxovalWorkspace,
ItemExtrasInput,
ItemTrackingInput,
} from "../types";
import { measureTextWidth } from "../utils/textWidth";
import { useItemCompletionOrder } from "./useItemCompletionOrder";

type ItemSortMode = "manual" | "name" | "updated" | "week";

const ITEM_EXTRA_KEYS = [
  "installments",
  "firstInstallmentOn",
  "purchasedAt",
  "paymentMethod",
  "installmentCents",
  "assigneeId",
  "giftFrom",
  "giftMessage",
  "thanked",
  "warrantyMonths",
  "warrantyUntil",
  "storeName",
] as const satisfies readonly (keyof ItemExtrasInput)[];
type CategorySwipeDirection = "next" | "previous";

const APP_NAME = "Casa Mia";
// A dica de "npm run dev" só existe no desenvolvimento: o Vite troca `import.meta.env.DEV` por
// `false` no build e remove o texto, então ela nunca chega ao bundle de produção.
const STALE_SERVER_MESSAGE = import.meta.env.DEV
  ? "O servidor está desatualizado e não reconheceu os dados do item (situação, desconto ou quantidade). Reinicie o servidor (npm run dev) e tente de novo."
  : "Não foi possível salvar o item agora. Atualize a página e tente novamente.";

/** Título padrão da aba. Janelas e telas específicas ainda mostram "Contexto | Casa Mia". */
const APP_TITLE = `${APP_NAME} | Enxoval de casa nova`;

function makeTitle(context?: string) {
  return context ? `${context} | ${APP_NAME}` : APP_TITLE;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function normalizePriceCents(priceCents: number | string | null | undefined) {
  if (typeof priceCents === "number" && Number.isFinite(priceCents))
    return Math.round(priceCents);
  if (typeof priceCents === "string" && priceCents.trim()) {
    const parsed = Number(priceCents);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function formatCurrency(priceCents: number | string | null | undefined) {
  const normalizedPriceCents = normalizePriceCents(priceCents);
  return normalizedPriceCents !== null
    ? currencyFormatter.format(normalizedPriceCents / 100)
    : currencyFormatter.format(0);
}

function priceTextToCents(value: string) {
  const digits = value.replace(/\D/g, "");
  const cents = digits ? Number(digits) : 0;
  return cents > 0 ? cents : null;
}

function formatPriceInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 12);
  return digits ? currencyFormatter.format(Number(digits) / 100) : "";
}

function getUpdatedAtTime(item: Pick<EnxovalItem, "updatedAt">) {
  const time = new Date(item.updatedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return dateTimeFormatter.format(date);
}

const SIDEBAR_MIN_WIDTH = 280;
const SIDEBAR_ROW_CHROME = 228;

export function useWorkspace() {
  // The URL selects the workspace as well as its screen; storage is only a legacy fallback.
  const [initialRoute] = useState(
    () =>
      parseAppRoute(window.location.pathname) ?? {
        view: "list" as const,
        categoryId: "",
      },
  );
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(
    initialRoute.view,
  );
  // Ambiente da URL só pode ser aplicado quando o primeiro carregamento trouxer os ambientes.
  const workspaceRequestRef = useRef(0);
  const historyNavigationRef = useRef(false);
  const [selectedEnxovalId, setSelectedEnxovalId] = useState(
    initialRoute.enxovalId,
  );
  const [user, setUser] = useState<AuthUser | null>(null);
  const [enxovais, setEnxovais] = useState<EnxovalSummary[]>([]);
  const [activeEnxoval, setActiveEnxoval] = useState<EnxovalSummary | null>(
    null,
  );
  const [members, setMembers] = useState<EnxovalMember[]>([]);
  const [items, setItems] = useState<EnxovalItem[]>([]);
  const completionOrder = useItemCompletionOrder(items, activeEnxoval?.id);
  const { celebration: ninoCelebration, celebrate: celebrateWithNino } =
    useNinoCelebration(activeEnxoval?.id);
  const [categories, setCategories] = useState<EnxovalCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [showOnlyPricedItems, setShowOnlyPricedItems] = useState(false);
  const [showOnlyCheckedItems, setShowOnlyCheckedItems] = useState(false);
  const [showOnlyUnpricedItems, setShowOnlyUnpricedItems] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ItemStatus | "all">("all");
  const [itemSortMode, setItemSortMode] = useState<ItemSortMode>("manual");
  // Atalho escolhido acima da lista (esta semana, baixou de preço, compras sem valor).
  const [quickFilter, setQuickFilter] = useState<QuickFilter | null>(null);
  // Quem vai comprar (Fase 11.2): meus itens, sem responsável ou de alguém do enxoval.
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  // Item recém-criado: na lista de todos os ambientes (agrupada por ambiente) ele aparece no topo de tudo, até a pessoa mudar de lista.
  const [justAddedItemId, setJustAddedItemId] = useState<string | null>(null);
  const [toast, setToast] = useState<UndoToastMessage | null>(null);
  const showToast = useCallback(
    (text: string, undo?: UndoToastMessage["undo"], actionLabel?: string) => {
      setToast({ id: Date.now(), text, undo, actionLabel });
    },
    [],
  );
  const [categorySwipeOffset, setCategorySwipeOffset] = useState(0);
  const [categorySwipeDirection, setCategorySwipeDirection] =
    useState<CategorySwipeDirection | null>(null);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  // Central de ajuda: quem abriu (botão do topo ou menu do celular) recebe o foco de volta ao fechar.
  const helpTriggerRef = useRef<HTMLElement | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const openWorkspaceMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    menuTriggerRef.current = event.currentTarget;
    setIsWorkspaceMenuOpen(true);
  };
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddChoiceOpen, setIsAddChoiceOpen] = useState(false);
  const chipsScrollRef = useRef<HTMLDivElement>(null);
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [isCreateEnxovalOpen, setIsCreateEnxovalOpen] = useState(false);
  const [isRenameEnxovalOpen, setIsRenameEnxovalOpen] = useState(false);
  const [isDeleteEnxovalOpen, setIsDeleteEnxovalOpen] = useState(false);
  const [isLeaveEnxovalOpen, setIsLeaveEnxovalOpen] = useState(false);
  const [isDiscountsOpen, setIsDiscountsOpen] = useState(false);
  const [discountCategoryId, setDiscountCategoryId] = useState("");
  const [discountItemId, setDiscountItemId] = useState("");
  const [discountText, setDiscountText] = useState("");
  const [itemToDelete, setItemToDelete] = useState<EnxovalItem | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [newEnxovalName, setNewEnxovalName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryToRename, setCategoryToRename] =
    useState<EnxovalCategory | null>(null);
  const [renameCategoryName, setRenameCategoryName] = useState("");
  const [categoryToDelete, setCategoryToDelete] =
    useState<EnxovalCategory | null>(null);
  const [isOrdering, setIsOrdering] = useState(false);
  const [newEnxovalUseDefaultTemplate, setNewEnxovalUseDefaultTemplate] =
    useState(true);
  const [renameEnxovalName, setRenameEnxovalName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitations, setInvitations] = useState<EnxovalInvitation[]>([]);
  const [inviteNotice, setInviteNotice] = useState("");
  /** Id de quem aguarda a segunda confirmação para ser removido do enxoval. */
  const [memberToRemoveId, setMemberToRemoveId] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [isDialogSubmitting, setIsDialogSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [headerProgress, setHeaderProgress] = useState(0);
  const [isHeaderMobile, setIsHeaderMobile] = useState(false);
  const [error, setError] = useState("");
  const pullStartYRef = useRef<number | null>(null);
  const pullLastDistanceRef = useRef(0);
  useEffect(() => {
    setJustAddedItemId(null);
  }, [activeCategoryId, itemSortMode, activeEnxoval?.id]);
  useEffect(() => {
    if (workspaceView !== "list") return;
    const frame = window.requestAnimationFrame(() => {
      const scroller = chipsScrollRef.current;
      if (!scroller || scroller.clientWidth === 0) return;
      const selected = scroller.querySelector<HTMLElement>(
        '.environment-select[aria-current="true"]',
      );
      if (!selected) return;
      const containerRect = scroller.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();
      scroller.scrollTo({
        left:
          scroller.scrollLeft +
          selectedRect.left -
          containerRect.left -
          (scroller.clientWidth - selectedRect.width) / 2,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeCategoryId, workspaceView, categories, isHeaderMobile]);
  const categorySwipeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    isSwiping: boolean;
    isCanceled: boolean;
  } | null>(null);
  const categorySwipeAnimationTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (categorySwipeAnimationTimerRef.current !== null) {
        window.clearTimeout(categorySwipeAnimationTimerRef.current);
      }
    },
    [],
  );
  const applyWorkspace = (workspace: EnxovalWorkspace) => {
    setSelectedEnxovalId(workspace.enxoval.id);
    setActiveEnxoval(workspace.enxoval);
    setMembers(workspace.members);
    setCategories(workspace.categories);
    setItems(workspace.items);
    setActiveCategoryId("");
  };

  const applyBootstrap = (
    data: BootstrapData,
    options?: { promptCreateEnxoval?: boolean; route?: AppRoute },
  ) => {
    setUser(data.user);
    setEnxovais(data.enxovais);
    setActiveEnxoval(data.activeEnxoval);
    setMembers(data.members);
    setCategories(data.categories);
    setItems(data.items);
    const route =
      options?.route ?? parseAppRoute(window.location.pathname) ?? initialRoute;
    const selected =
      data.activeEnxoval?.id ??
      data.enxovais.find((enxoval) => enxoval.id === route.enxovalId)?.id ??
      data.enxovais[0]?.id;
    setSelectedEnxovalId(selected);
    const routeCategoryId =
      !route.enxovalId || route.enxovalId === selected ? route.categoryId : "";
    setWorkspaceView(route.view);
    setActiveCategoryId(
      data.categories.some((category) => category.id === routeCategoryId)
        ? routeCategoryId
        : "",
    );

    if (options?.promptCreateEnxoval) {
      setDialogError("");
      setNewEnxovalName("");
      setNewEnxovalUseDefaultTemplate(true);
      setIsCreateEnxovalOpen(true);
    }
  };

  const completeAuthentication = async (data: BootstrapData) => {
    historyNavigationRef.current = false;
    const route = parseAppRoute(window.location.pathname);
    if (
      !data.user.mustChangePassword &&
      data.user.emailVerified !== false &&
      route?.enxovalId &&
      data.activeEnxoval?.id !== route.enxovalId &&
      data.enxovais.some((enxoval) => enxoval.id === route.enxovalId)
    ) {
      const request = ++workspaceRequestRef.current;
      setIsLoading(true);
      try {
        const selected = await fetchBootstrap(route.enxovalId);
        if (request === workspaceRequestRef.current)
          applyBootstrap(selected, { route });
      } catch (err) {
        if (request === workspaceRequestRef.current) {
          applyBootstrap(data, { route });
          setBootstrapError(
            err instanceof Error
              ? err.message
              : "Não foi possível abrir o enxoval.",
          );
        }
      } finally {
        if (request === workspaceRequestRef.current) setIsLoading(false);
      }
    } else applyBootstrap(data);
  };

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    // Volta para o enxoval que a pessoa estava usando (o servidor ignora se ela não tiver mais acesso).
    const loadInitialWorkspace = async () => {
      let targetEnxoval =
        parseAppRoute(window.location.pathname)?.enxovalId ??
        readStoredEnxovalId();
      const params = new URLSearchParams(window.location.search);
      if (params.get("assinatura") === "sucesso") {
        try {
          const confirmed = await syncBilling(
            params.get("session_id") ?? undefined,
            true,
          );
          if (confirmed.accessAllowed) {
            targetEnxoval ??= confirmed.enxovalId ?? undefined;
            storeEnxovalId(targetEnxoval ?? null);
            params.delete("assinatura");
            params.delete("plano");
            params.delete("session_id");
            // Mantém a sub-rota de onde o checkout saiu.
            const returnPath = isAppPath(window.location.pathname)
              ? window.location.pathname
              : "/app";
            window.history.replaceState(
              null,
              "",
              `${returnPath}${params.size ? `?${params}` : ""}`,
            );
          }
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) throw err;
          // Keep the session and let the access screen retry confirmation.
        }
      }
      return fetchBootstrap(targetEnxoval);
    };
    loadInitialWorkspace()
      .then((data) => {
        if (isMounted) {
          setBootstrapError("");
          applyBootstrap(data);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err instanceof ApiError && err.status === 401) {
          setBootstrapError("");
          setUser(null);
          return;
        }
        setBootstrapError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar seus dados.",
        );
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [bootstrapAttempt]);

  useEffect(() => {
    if (user) storeEnxovalId(selectedEnxovalId ?? null);
  }, [user, selectedEnxovalId]);

  useEffect(() => {
    const expire = () => {
      clearSubscriptionStatus();
      setUser(null);
      setItems([]);
      setCategories([]);
      setMembers([]);
      setEnxovais([]);
      setActiveEnxoval(null);
      setSelectedEnxovalId(undefined);
      workspaceRequestRef.current++;
      historyNavigationRef.current = false;
      setIsWorkspaceLoading(false);
      syncedRoutePathRef.current = null;
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expire);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expire);
  }, []);

  // Tela atual -> URL. Navegar pelo app cria uma entrada no histórico (voltar/avançar funcionam);
  // a primeira sincronização só corrige a URL aberta (ambiente que não existe cai em /app).
  const syncedRoutePathRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      isLoading ||
      isWorkspaceLoading ||
      historyNavigationRef.current ||
      !user ||
      user.mustChangePassword ||
      user.emailVerified === false
    )
      return;
    if (!isAppPath(window.location.pathname)) return;
    const path = appRoutePath({
      view: workspaceView,
      categoryId: activeCategoryId,
      enxovalId: selectedEnxovalId,
    });
    const isFirstSync = syncedRoutePathRef.current === null;
    syncedRoutePathRef.current = path;
    if (window.location.pathname === path) return;
    if (isFirstSync) {
      window.history.replaceState(
        window.history.state,
        "",
        `${path}${window.location.search}${window.location.hash}`,
      );
    } else {
      window.history.pushState(null, "", path);
    }
  }, [
    activeCategoryId,
    isLoading,
    isWorkspaceLoading,
    user,
    workspaceView,
    selectedEnxovalId,
  ]);

  // URL -> tela, ao voltar/avançar no navegador.
  useEffect(() => {
    const onPopState = async () => {
      const route = parseAppRoute(window.location.pathname);
      if (!route || !user) return;
      const request = ++workspaceRequestRef.current;
      if (route.enxovalId !== selectedEnxovalId) {
        historyNavigationRef.current = true;
        setIsWorkspaceLoading(true);
        setError("");
        try {
          const data = await fetchBootstrap(route.enxovalId);
          if (request !== workspaceRequestRef.current) return;
          applyBootstrap(data, { route });
          const selected =
            data.activeEnxoval?.id ??
            data.enxovais.find((enxoval) => enxoval.id === route.enxovalId)
              ?.id ??
            data.enxovais[0]?.id;
          const categoryId =
            (!route.enxovalId || route.enxovalId === selected) &&
            data.categories.some((category) => category.id === route.categoryId)
              ? route.categoryId
              : "";
          const path = appRoutePath({
            ...route,
            enxovalId: selected,
            categoryId,
          });
          syncedRoutePathRef.current = path;
          window.history.replaceState(
            window.history.state,
            "",
            `${path}${window.location.search}${window.location.hash}`,
          );
        } catch (err) {
          if (request !== workspaceRequestRef.current) return;
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível abrir o enxoval.",
          );
          const path = appRoutePath({
            enxovalId: selectedEnxovalId,
            view: workspaceView,
            categoryId: activeCategoryId,
          });
          window.history.replaceState(window.history.state, "", path);
        } finally {
          if (request === workspaceRequestRef.current) {
            historyNavigationRef.current = false;
            setIsWorkspaceLoading(false);
          }
        }
        return;
      }
      historyNavigationRef.current = false;
      setIsWorkspaceLoading(false);
      const categoryId = categories.some(
        (category) => category.id === route.categoryId,
      )
        ? route.categoryId
        : "";
      const path = appRoutePath({
        view: route.view,
        categoryId,
        enxovalId: selectedEnxovalId,
      });
      // Ambiente excluído desde então: corrige a URL sem criar outra entrada.
      if (path !== window.location.pathname)
        window.history.replaceState(window.history.state, "", path);
      syncedRoutePathRef.current = path;
      setWorkspaceView(route.view);
      setActiveCategoryId(categoryId);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [categories, selectedEnxovalId, user, workspaceView, activeCategoryId]);

  const needsOnboarding = Boolean(
    user &&
    !user.isGuest &&
    !user.mustChangePassword &&
    user.emailVerified !== false &&
    user.plan === "free" &&
    !user.onboardingCompleted &&
    !user.trialUsed &&
    enxovais.length === 0,
  );
  useEffect(() => {
    if (!isLoading && needsOnboarding && window.location.pathname !== "/")
      window.location.replace("/comecar");
  }, [isLoading, needsOnboarding]);

  useEffect(() => {
    if (user?.mustChangePassword) {
      document.title = makeTitle("Defina sua nova senha");
      return;
    }
    if (window.location.pathname === "/") {
      document.title = APP_TITLE;
      return;
    }
    if (isLoading) {
      document.title = APP_TITLE;
      return;
    }

    if (!user) {
      return;
    }

    if (isCreateEnxovalOpen) {
      document.title = makeTitle("Novo enxoval");
      return;
    }

    if (isCreateCategoryOpen) {
      document.title = makeTitle("Novo ambiente");
      return;
    }

    if (isRenameEnxovalOpen) {
      document.title = makeTitle(
        activeEnxoval ? "Editar " + activeEnxoval.name : "Editar enxoval",
      );
      return;
    }

    if (isDeleteEnxovalOpen) {
      document.title = makeTitle(
        activeEnxoval ? "Excluir " + activeEnxoval.name : "Excluir enxoval",
      );
      return;
    }

    if (isLeaveEnxovalOpen) {
      document.title = makeTitle(
        activeEnxoval ? "Sair de " + activeEnxoval.name : "Sair do enxoval",
      );
      return;
    }

    if (isDiscountsOpen) {
      document.title = makeTitle("Descontos e cashback");
      return;
    }

    if (itemToDelete) {
      document.title = makeTitle("Excluir " + itemToDelete.name);
      return;
    }

    if (categoryToDelete) {
      document.title = makeTitle("Excluir " + categoryToDelete.name);
      return;
    }

    if (isInviteOpen) {
      document.title = makeTitle(
        activeEnxoval
          ? "Convidar para " + activeEnxoval.name
          : "Convidar pessoa",
      );
      return;
    }

    // Sem janela aberta, o título segue a rota.
    const routeCategory = categories.find(
      (category) => category.id === activeCategoryId,
    );
    document.title =
      workspaceView === "overview"
        ? makeTitle("Meu Lar")
        : workspaceView === "plan"
          ? makeTitle("Planejamento")
          : workspaceView === "store"
            ? makeTitle("Modo loja")
            : routeCategory
            ? makeTitle(routeCategory.name)
            : APP_TITLE;
  }, [
    activeCategoryId,
    categories,
    workspaceView,
    activeEnxoval,
    isCreateCategoryOpen,
    isCreateEnxovalOpen,
    isDeleteEnxovalOpen,
    isDiscountsOpen,
    isInviteOpen,
    isLeaveEnxovalOpen,
    isLoading,
    isRenameEnxovalOpen,
    isWorkspaceLoading,
    itemToDelete,
    categoryToDelete,
    user,
  ]);

  useEffect(() => {
    let animationFrame = 0;

    const updateHeaderSize = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const isMobile = window.innerWidth < 640;
        setIsHeaderMobile(isMobile);
        setHeaderProgress(
          isMobile ? Math.min(Math.max(window.scrollY / 140, 0), 1) : 0,
        );
      });
    };

    updateHeaderSize();
    window.addEventListener("scroll", updateHeaderSize, { passive: true });
    window.addEventListener("resize", updateHeaderSize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", updateHeaderSize);
      window.removeEventListener("resize", updateHeaderSize);
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    setError("");

    try {
      const currentCategoryId = activeCategoryId;
      const request = workspaceRequestRef.current;
      const data = await fetchBootstrap(selectedEnxovalId);
      if (request !== workspaceRequestRef.current) return;
      applyBootstrap(data);

      if (
        currentCategoryId &&
        data.categories.some((category) => category.id === currentCategoryId)
      ) {
        setActiveCategoryId(currentCategoryId);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível atualizar o enxoval.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [activeCategoryId, selectedEnxovalId, isRefreshing]);

  useEffect(() => {
    if (!user || !isHeaderMobile || isWorkspaceMenuOpen) {
      pullStartYRef.current = null;
      pullLastDistanceRef.current = 0;
      setPullDistance(0);
      return;
    }

    const pullThreshold = 72;
    let resetTimer: number | undefined;

    const isInteractiveTarget = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(
        target.closest('button, input, textarea, select, a, [role="button"]'),
      );

    const resetPull = () => {
      pullStartYRef.current = null;
      pullLastDistanceRef.current = 0;
      setPullDistance(0);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (
        isRefreshing ||
        window.scrollY > 0 ||
        event.touches.length !== 1 ||
        isInteractiveTarget(event.target)
      ) {
        resetPull();
        return;
      }

      pullStartYRef.current = event.touches[0].clientY;
      pullLastDistanceRef.current = 0;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const startY = pullStartYRef.current;
      if (startY === null || event.touches.length !== 1) return;

      const delta = event.touches[0].clientY - startY;
      if (delta <= 0 || window.scrollY > 0) {
        resetPull();
        return;
      }

      const distance = Math.min(Math.round(delta * 0.55), 96);
      pullLastDistanceRef.current = distance;
      setPullDistance(distance);

      if (distance > 4 && event.cancelable) {
        event.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (pullStartYRef.current === null) return;

      const shouldRefresh = pullLastDistanceRef.current >= pullThreshold;
      pullStartYRef.current = null;
      pullLastDistanceRef.current = 0;

      if (!shouldRefresh) {
        setPullDistance(0);
        return;
      }

      setPullDistance(pullThreshold);
      void handleRefresh().finally(() => {
        resetTimer = window.setTimeout(() => setPullDistance(0), 180);
      });
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", resetPull);

    return () => {
      if (resetTimer) window.clearTimeout(resetTimer);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", resetPull);
    };
  }, [handleRefresh, isWorkspaceMenuOpen, isHeaderMobile, isRefreshing, user]);

  // Sem ambiente selecionado (activeCategoryId vazio) a lista mostra todos os itens.
  const activeCategory = categories.find(
    (category) => category.id === activeCategoryId,
  );
  const isAllEnvironments = !activeCategory;
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const isSearching = normalizedSearchQuery.length > 0;
  const isShowingLatestChanges = itemSortMode === "updated";
  const hasItemFilters =
    showOnlyPricedItems ||
    showOnlyUnpricedItems ||
    showOnlyCheckedItems ||
    statusFilter !== "all" ||
    assigneeFilter !== "all" ||
    quickFilter !== null;
  const activeFilterCount =
    (quickFilter ? 1 : 0) +
    (assigneeFilter !== "all" ? 1 : 0) +
    (showOnlyPricedItems ? 1 : 0) +
    (showOnlyUnpricedItems ? 1 : 0) +
    (showOnlyCheckedItems ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (itemSortMode !== "manual" ? 1 : 0);
  // Semana de compra de cada item: calculada uma vez por mudança nos itens ou no perfil do enxoval.
  const purchasePlan = useMemo(
    () =>
      activeEnxoval
        ? buildPurchasePlan(items, {
            tier: activeEnxoval.spendingTier,
            moveDate: activeEnxoval.moveDate,
          })
        : null,
    [items, activeEnxoval],
  );
  const moveDate = activeEnxoval?.moveDate ?? null;
  // Itens que entram nos atalhos "Esta semana" e "Baixou de preço".
  const weekIdSet = useMemo(
    () => thisWeekIds(purchasePlan, moveDate),
    [purchasePlan, moveDate],
  );
  const dealIdSet = useMemo(() => dealIds(items), [items]);
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const filteredItems = useMemo(() => {
    const baseItems =
      isShowingLatestChanges || isAllEnvironments
        ? items
        : activeCategory
          ? items.filter((item) => item.categoryId === activeCategory.id)
          : [];

    const searchedItems = isSearching
      ? baseItems.filter((item) => {
          const categoryName =
            categoryById.get(item.categoryId)?.name ?? item.category;
          const searchableText = normalizeSearchText(
            [
              item.name,
              item.description,
              item.link,
              item.priceCents === null ? "" : String(item.priceCents / 100),
              categoryName,
            ].join(" "),
          );

          return searchableText.includes(normalizedSearchQuery);
        })
      : baseItems;

    const narrowedItems = searchedItems.filter((item) => {
      if (showOnlyPricedItems) {
        const priceCents = normalizePriceCents(item.priceCents);
        if (priceCents === null || priceCents <= 0) return false;
      }

      if (showOnlyCheckedItems && !item.checked) return false;
      // "Sem preço" repete a conta do resumo: itens pendentes que ainda não têm preço.
      if (
        showOnlyUnpricedItems &&
        (!isPendingStatus(item.status) ||
          (normalizePriceCents(item.priceCents) ?? 0) > 0)
      )
        return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (quickFilter === "week" && !weekIdSet.has(item.id)) return false;
      if (quickFilter === "deals" && !dealIdSet.has(item.id)) return false;
      if (quickFilter === "boughtUnpriced" && !isBoughtWithoutPrice(item))
        return false;
      if (quickFilter && !matchesQuickFilter(item, quickFilter, user?.id))
        return false;
      if (!matchesAssignee(item, assigneeFilter, user?.id)) return false;
      return true;
    });

    const categoryPosition = new Map(
      categories.map((category, index) => [category.id, index]),
    );
    return [...narrowedItems].sort((firstItem, secondItem) => {
      const completionDifference =
        completionOrder.orderOf(firstItem) -
        completionOrder.orderOf(secondItem);
      if (completionDifference) return completionDifference;
      if (itemSortMode === "manual")
        return (
          (isAllEnvironments && justAddedItemId
            ? Number(secondItem.id === justAddedItemId) -
              Number(firstItem.id === justAddedItemId)
            : 0) ||
          (isAllEnvironments
            ? (categoryPosition.get(firstItem.categoryId) ?? 0) -
              (categoryPosition.get(secondItem.categoryId) ?? 0)
            : 0) ||
          firstItem.sortOrder - secondItem.sortOrder ||
          firstItem.name.localeCompare(secondItem.name, "pt-BR")
        );
      if (itemSortMode === "updated") {
        const updatedDifference =
          getUpdatedAtTime(secondItem) - getUpdatedAtTime(firstItem);
        if (updatedDifference !== 0) return updatedDifference;
      }
      if (itemSortMode === "week") {
        const weekDifference =
          buyWeekRank(
            firstItem,
            purchasePlan,
            completionOrder.pendingIds.has(firstItem.id),
          ) -
          buyWeekRank(
            secondItem,
            purchasePlan,
            completionOrder.pendingIds.has(secondItem.id),
          );
        if (weekDifference !== 0) return weekDifference;
      }

      return (
        firstItem.name.localeCompare(secondItem.name, "pt-BR", {
          sensitivity: "base",
        }) ||
        firstItem.category.localeCompare(secondItem.category, "pt-BR", {
          sensitivity: "base",
        })
      );
    });
  }, [
    activeCategory,
    categories,
    categoryById,
    isAllEnvironments,
    isSearching,
    isShowingLatestChanges,
    itemSortMode,
    items,
    completionOrder.completions,
    justAddedItemId,
    normalizedSearchQuery,
    purchasePlan,
    quickFilter,
    assigneeFilter,
    user?.id,
    dealIdSet,
    weekIdSet,
    showOnlyCheckedItems,
    showOnlyPricedItems,
    showOnlyUnpricedItems,
    statusFilter,
  ]);
  const filteredCheckedCount = doneItems(filteredItems).length;
  const filteredActiveCount = activeItems(filteredItems).length;
  const itemCountText = `${filteredItems.length} ${filteredItems.length === 1 ? "item" : "itens"}`;
  const listTitle = isSearching
    ? "Resultados da busca"
    : isShowingLatestChanges
      ? "Últimas alterações"
      : quickFilter
        ? activeCategory
          ? `${QUICK_FILTER_TITLE[quickFilter]} em ${activeCategory.name}`
          : QUICK_FILTER_TITLE[quickFilter]
        : hasItemFilters
          ? activeCategory
            ? `Itens filtrados em ${activeCategory.name}`
            : "Itens filtrados"
          : activeCategory
            ? `Progresso de ${activeCategory.name}`
            : "Progresso do enxoval";
  const listCounterText =
    !isSearching && !isShowingLatestChanges && !hasItemFilters
      ? `${filteredCheckedCount} de ${filteredActiveCount} itens`
      : itemCountText;
  const searchScopeLabel = activeCategory
    ? `Buscar em ${activeCategory.name}`
    : "Buscar em todos os ambientes";
  const canSwipeCategories =
    categories.length > 0 && !isSearching && !isShowingLatestChanges;
  const categorySwipeAnimationClass =
    categorySwipeDirection === "next"
      ? "category-list-enter-next"
      : categorySwipeDirection === "previous"
        ? "category-list-enter-previous"
        : "";
  const categorySwipeStyle: React.CSSProperties | undefined =
    categorySwipeOffset !== 0
      ? {
          opacity: 1 - Math.min(Math.abs(categorySwipeOffset) / 360, 0.16),
          transform: `translateX(${categorySwipeOffset}px)`,
          transition: "none",
        }
      : undefined;

  // Na lista de um ambiente, os totais (progresso e gastos) são só daquele ambiente.
  const scopeItems = useMemo(
    () =>
      workspaceView === "list" && activeCategory
        ? items.filter((item) => item.categoryId === activeCategory.id)
        : null,
    [activeCategory, items, workspaceView],
  );
  const progressStats = useMemo(() => {
    const scoped = scopeItems ?? items;
    const total = activeItems(scoped).length;
    const completed = doneItems(scoped).length;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, percentage };
  }, [items, scopeItems]);
  const checkedSubtotalSpentCents = useMemo(() => sumBought(items), [items]);
  const receivedValueCents = useMemo(() => sumReceived(items), [items]);
  const enxovalDiscountCents =
    normalizePriceCents(activeEnxoval?.discountCents) ?? 0;
  const itemDiscountsTotalCents = useMemo(
    () => sumItemDiscounts(items),
    [items],
  );
  const discountInputCents = priceTextToCents(discountText) ?? 0;
  const selectedDiscountItem =
    items.find((item) => item.id === discountItemId) ?? null;
  const discountItemOptions = items
    .filter(
      (item) =>
        item.categoryId === discountCategoryId && discountApplies(item.status),
    )
    .map((item) => ({
      value: item.id,
      label: `${item.name} · ${
        normalizePriceCents(item.priceCents)
          ? formatCurrency(item.priceCents)
          : "sem preço"
      }`,
    }));
  const registeredDiscountItems = items.filter(
    (item) => discountApplies(item.status) && item.discountCents > 0,
  );
  const checkedTotalSpentCents = Math.max(
    0,
    checkedSubtotalSpentCents - enxovalDiscountCents,
  );
  const savedDiscountText = formatCurrency(enxovalDiscountCents);
  const receivedValueText = formatCurrency(receivedValueCents);
  const hasEnxoval = enxovais.length > 0 && Boolean(activeEnxoval);
  const isOwner = activeEnxoval?.role === "owner";
  const visibleProgress = isHeaderMobile ? headerProgress : 0;
  const headerStyle = isHeaderMobile
    ? {
        paddingTop: `${10 - 3 * visibleProgress}px`,
        paddingBottom: `${10 - 3 * visibleProgress}px`,
      }
    : undefined;
  const eyebrowStyle: React.CSSProperties = {
    maxHeight: `${16 * (1 - visibleProgress)}px`,
    opacity: 1 - visibleProgress,
    transform: `translateY(${-4 * visibleProgress}px)`,
    pointerEvents: visibleProgress > 0.9 ? "none" : "auto",
  };
  const titleStyle = isHeaderMobile
    ? {
        fontSize: `${20 - 3 * visibleProgress}px`,
      }
    : undefined;
  const categoryBarStyle = isHeaderMobile
    ? {
        marginTop: `${8 - 3 * visibleProgress}px`,
      }
    : undefined;

  const startCategorySwipeAnimation = useCallback(
    (direction: CategorySwipeDirection) => {
      if (categorySwipeAnimationTimerRef.current !== null) {
        window.clearTimeout(categorySwipeAnimationTimerRef.current);
      }

      setCategorySwipeDirection(direction);
      categorySwipeAnimationTimerRef.current = window.setTimeout(() => {
        setCategorySwipeDirection(null);
        categorySwipeAnimationTimerRef.current = null;
      }, 220);
    },
    [],
  );

  const changeCategoryBySwipe = useCallback(
    (direction: CategorySwipeDirection) => {
      if (!canSwipeCategories) return false;

      // -1 representa "todos os ambientes", antes do primeiro ambiente.
      const currentCategoryIndex = activeCategory
        ? categories.findIndex((category) => category.id === activeCategory.id)
        : -1;
      const nextCategoryIndex =
        direction === "next"
          ? currentCategoryIndex + 1
          : currentCategoryIndex - 1;
      if (nextCategoryIndex < -1 || nextCategoryIndex >= categories.length)
        return false;

      startCategorySwipeAnimation(direction);
      setActiveCategoryId(
        nextCategoryIndex === -1 ? "" : categories[nextCategoryIndex].id,
      );
      return true;
    },
    [
      activeCategory,
      canSwipeCategories,
      categories,
      startCategorySwipeAnimation,
    ],
  );

  const resetCategorySwipe = useCallback(() => {
    categorySwipeRef.current = null;
    setCategorySwipeOffset(0);
  }, []);

  const handleCategoryListPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        !canSwipeCategories ||
        (event.pointerType === "mouse" && event.button !== 0)
      )
        return;

      const target = event.target;
      // Menus suspensos abrem num portal: o evento sobe pela árvore do React, mas não é um toque na lista.
      // Capturar o ponteiro aqui roubava o "soltar" da opção e o select não escolhia nada.
      if (!(target instanceof Node) || !event.currentTarget.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest('button, input, textarea, select, a, [role="button"]') &&
        !target.closest(".item-title-button")
      )
        return;

      categorySwipeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        isSwiping: false,
        isCanceled: false,
      };
      setCategorySwipeOffset(0);
      if (!(target instanceof Element && target.closest(".item-title-button")))
        event.currentTarget.setPointerCapture(event.pointerId);
    },
    [canSwipeCategories],
  );

  const handleCategoryListPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const swipe = categorySwipeRef.current;
      if (!swipe || swipe.pointerId !== event.pointerId || swipe.isCanceled)
        return;

      const deltaX = event.clientX - swipe.startX;
      const deltaY = event.clientY - swipe.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!swipe.isSwiping) {
        if (absY > 12 && absY > absX) {
          swipe.isCanceled = true;
          setCategorySwipeOffset(0);
          return;
        }

        if (absX < 16 || absX < absY * 1.2) return;
        swipe.isSwiping = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      event.preventDefault();
      setCategorySwipeOffset(Math.max(-72, Math.min(72, deltaX * 0.45)));
    },
    [],
  );

  const handleCategoryListPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const swipe = categorySwipeRef.current;
      if (!swipe || swipe.pointerId !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const deltaX = event.clientX - swipe.startX;
      const deltaY = event.clientY - swipe.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (
        !swipe.isCanceled &&
        swipe.isSwiping &&
        absX >= 56 &&
        absX > absY * 1.1
      ) {
        void changeCategoryBySwipe(deltaX < 0 ? "next" : "previous");
      }

      resetCategorySwipe();
    },
    [changeCategoryBySwipe, resetCategorySwipe],
  );

  const handleCategoryListPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      resetCategorySwipe();
    },
    [resetCategorySwipe],
  );

  const handleEnxovalChange = async (enxovalId: string) => {
    if (isOrdering) return;
    if (!enxovalId || enxovalId === activeEnxoval?.id) return;

    const request = ++workspaceRequestRef.current;
    historyNavigationRef.current = false;
    setIsWorkspaceLoading(true);
    setError("");

    try {
      const workspace = await fetchEnxovalRequest(enxovalId);
      if (request !== workspaceRequestRef.current) return;
      applyWorkspace(workspace);
    } catch (err) {
      if (request !== workspaceRequestRef.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível abrir o enxoval.",
      );
    } finally {
      if (request === workspaceRequestRef.current) setIsWorkspaceLoading(false);
    }
  };

  /** Atalho do resumo: lista só os itens pendentes sem preço, nos ambientes que estavam em foco. */
  const showUnpricedItems = () => {
    setQuickFilter(null);
    setShowOnlyPricedItems(false);
    setShowOnlyCheckedItems(false);
    setStatusFilter("all");
    setShowOnlyUnpricedItems(true);
    setSearchQuery("");
    setWorkspaceView("list");
  };

  /** Item devolvido pelo servidor depois de mexer nas lojas ou nos documentos dele. */
  const replaceItem = (saved: EnxovalItem) => {
    setItems((current) =>
      current.map((item) => (item.id === saved.id ? saved : item)),
    );
  };

  const updateItem = async (
    id: string,
    updates: Partial<EnxovalItem> & ItemTrackingInput & ItemExtrasInput,
  ) => {
    const itemBeforeSave = items.find((item) => item.id === id);
    const shouldOptimisticallyUpdate =
      Object.keys(updates).length === 1 &&
      (typeof updates.checked === "boolean" ||
        typeof updates.status === "string");
    const previousItem = shouldOptimisticallyUpdate
      ? items.find((item) => item.id === id)
      : undefined;

    if (shouldOptimisticallyUpdate) {
      setItems((current) =>
        current.map((item) =>
          item.id === id ? withStatusUpdate(item, updates) : item,
        ),
      );
    }

    const payload: Parameters<typeof updateItemRequest>[1] = {};
    if (typeof updates.name === "string") payload.name = updates.name;
    if (typeof updates.status === "string") payload.status = updates.status;
    else if (typeof updates.checked === "boolean")
      payload.checked = updates.checked;
    if (typeof updates.link === "string") payload.link = updates.link;
    if (typeof updates.description === "string")
      payload.description = updates.description;
    if (typeof updates.priceCents === "number" || updates.priceCents === null)
      payload.priceCents = updates.priceCents;
    if (typeof updates.discountCents === "number")
      payload.discountCents = updates.discountCents;
    if (typeof updates.quantity === "number")
      payload.quantity = updates.quantity;
    if (typeof updates.categoryId === "string")
      payload.categoryId = updates.categoryId;
    if (typeof updates.buyWeek === "number" || updates.buyWeek === null)
      payload.buyWeek = updates.buyWeek;
    if (updates.targetPriceCents !== undefined)
      payload.targetPriceCents = updates.targetPriceCents;
    if (typeof updates.priceAlertEnabled === "boolean")
      payload.priceAlertEnabled = updates.priceAlertEnabled;
    if (updates.trackedProductUrl !== undefined)
      payload.trackedProductUrl = updates.trackedProductUrl;
    if (updates.initialPriceCents !== undefined)
      payload.initialPriceCents = updates.initialPriceCents;
    if (updates.selectedVariation !== undefined)
      payload.selectedVariation = updates.selectedVariation;
    if (updates.priceBasis !== undefined)
      payload.priceBasis = updates.priceBasis;
    // Parcelas, responsável, presente e garantia seguem como vieram (o servidor valida).
    for (const key of ITEM_EXTRA_KEYS) {
      if (updates[key] !== undefined)
        (payload as Record<string, unknown>)[key] = updates[key];
    }

    if (Object.keys(payload).length === 0) return;

    try {
      const savedItem = await updateItemRequest(id, payload);
      // Um servidor que ainda roda o código antigo devolve o item sem situação e ignoraria a alteração.
      if (
        !isItemStatus(savedItem.status) ||
        typeof savedItem.quantity !== "number"
      )
        throw new Error(STALE_SERVER_MESSAGE);
      if (
        itemBeforeSave &&
        !isDoneStatus(itemBeforeSave.status) &&
        isDoneStatus(savedItem.status)
      ) {
        celebrateWithNino({
          itemId: savedItem.id,
          categoryId: savedItem.categoryId,
          name: savedItem.name,
        });
      }
      setItems((current) =>
        current.map((item) => (item.id === id ? savedItem : item)),
      );
    } catch (err) {
      if (previousItem) {
        setItems((current) =>
          current.map((item) => (item.id === id ? previousItem : item)),
        );
      }
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar a alteração.",
      );
      throw err;
    }
  };

  /** Data da mudança, lugar e perfil de gasto (só o dono): o servidor valida e devolve o enxoval atualizado. */
  const updatePlanning = async (updates: PlanningUpdates) => {
    if (!activeEnxoval) return;
    const updatedEnxoval = await updateEnxovalRequest(
      activeEnxoval.id,
      updates,
    );
    setActiveEnxoval(updatedEnxoval);
    setEnxovais((current) =>
      current.map((enxoval) =>
        enxoval.id === updatedEnxoval.id ? updatedEnxoval : enxoval,
      ),
    );
  };

  const addItem = async (
    name: string,
    categoryId?: string,
    categoryName?: string,
    details: Pick<
      EnxovalItem,
      | "priceCents"
      | "quantity"
      | "discountCents"
      | "link"
      | "description"
      | "status"
    > &
      ItemTrackingInput &
      ItemExtrasInput = {
      priceCents: null,
      quantity: 1,
      discountCents: 0,
      link: "",
      description: "",
      status: DEFAULT_ITEM_STATUS,
    },
  ) => {
    if (!activeEnxoval)
      throw new Error("Selecione um enxoval antes de adicionar itens.");

    // Parcelas, responsável, garantia e presente são validados no PATCH; o POST cria só o item base.
    const {
      installments,
      firstInstallmentOn,
      purchasedAt,
      paymentMethod,
      installmentCents,
      assigneeId,
      giftFrom,
      giftMessage,
      thanked,
      warrantyMonths,
      warrantyUntil,
      storeName,
      ...base
    } = details;
    const extras: ItemExtrasInput = {
      installments,
      firstInstallmentOn,
      purchasedAt,
      paymentMethod,
      installmentCents,
      assigneeId,
      giftFrom,
      giftMessage,
      thanked,
      warrantyMonths,
      warrantyUntil,
      storeName,
    };
    const extrasToSave = Object.fromEntries(
      Object.entries(extras).filter(([, value]) => value !== undefined),
    ) as ItemExtrasInput;

    const created = await createItemRequest({
      enxovalId: activeEnxoval.id,
      name,
      categoryId,
      categoryName,
      ...base,
    });
    let result = created;
    let extrasFailed = false;
    if (Object.keys(extrasToSave).length > 0) {
      try {
        result = { ...created, item: await updateItemRequest(created.item.id, extrasToSave) };
      } catch {
        extrasFailed = true;
      }
    }
    if (
      !isItemStatus(result.item.status) ||
      typeof result.item.quantity !== "number"
    )
      throw new Error(STALE_SERVER_MESSAGE);

    setCategories((current) => {
      if (current.some((category) => category.id === result.category.id))
        return current;
      return [...current, result.category].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    });

    // O item novo vem no topo do ambiente (o servidor o grava antes dos demais) e, em "Todos", no topo da lista.
    setItems((current) => [result.item, ...current]);
    setJustAddedItemId(result.item.id);
    window.requestAnimationFrame(() =>
      document
        .querySelector(`[data-item-id="${result.item.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
    // Na lista de todos os ambientes continua nela; a categoria só muda quando já havia uma ativa.
    setActiveCategoryId((current) => (current ? result.category.id : ""));
    if (extrasFailed)
      showToast(`${name} entrou na lista, mas parcelas, garantia ou responsável não foram salvos. Abra o item para repetir.`);
  };

  const openDeleteItem = (item: EnxovalItem) => {
    setDialogError("");
    setItemToDelete(item);
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;

    setIsDialogSubmitting(true);
    setDialogError("");

    try {
      const deletedId = itemToDelete.id;
      await deleteItemRequest(deletedId);
      setItems((current) => current.filter((item) => item.id !== deletedId));
      setItemToDelete(null);
      showToast(`${itemToDelete.name} saiu da lista.`);
    } catch (err) {
      setDialogError(
        err instanceof Error ? err.message : "Não foi possível remover o item.",
      );
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleCreateCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeEnxoval) return;

    const name = normalizeEnvironmentName(newCategoryName);
    if (!name) return;

    setIsDialogSubmitting(true);
    setDialogError("");

    try {
      const category = await createCategoryRequest(activeEnxoval.id, name);
      setCategories((current) => {
        const alreadyExists = current.some(
          (existing) => existing.id === category.id,
        );
        const nextCategories = alreadyExists
          ? current.map((existing) =>
              existing.id === category.id ? category : existing,
            )
          : [...current, category];

        return nextCategories.sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        );
      });
      setActiveCategoryId(category.id);
      setSearchQuery("");
      setNewCategoryName("");
      setIsCreateCategoryOpen(false);
    } catch (err) {
      setDialogError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar o ambiente.",
      );
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleCreateEnxoval = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newEnxovalName.trim();
    if (!name) return;

    setIsDialogSubmitting(true);
    setDialogError("");

    try {
      const workspace = await createEnxovalRequest(
        name,
        newEnxovalUseDefaultTemplate,
      );
      setEnxovais((current) => [...current, workspace.enxoval]);
      applyWorkspace(workspace);
      setNewEnxovalName("");
      setNewEnxovalUseDefaultTemplate(true);
      setIsCreateEnxovalOpen(false);
    } catch (err) {
      setDialogError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar o enxoval.",
      );
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleRenameEnxoval = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeEnxoval) return;

    const name = renameEnxovalName.trim();
    if (!name) return;

    setIsDialogSubmitting(true);
    setDialogError("");

    try {
      const updatedEnxoval = await updateEnxovalRequest(activeEnxoval.id, name);
      setActiveEnxoval(updatedEnxoval);
      setEnxovais((current) =>
        current.map((enxoval) =>
          enxoval.id === updatedEnxoval.id ? updatedEnxoval : enxoval,
        ),
      );
      setRenameEnxovalName("");
      setIsRenameEnxovalOpen(false);
    } catch (err) {
      setDialogError(
        err instanceof Error
          ? err.message
          : "Não foi possível renomear o enxoval.",
      );
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleDeleteEnxoval = async () => {
    if (!activeEnxoval) return;

    setIsDialogSubmitting(true);
    setDialogError("");

    try {
      const deletedId = activeEnxoval.id;
      await deleteEnxovalRequest(deletedId);

      const remainingEnxovais = enxovais.filter(
        (enxoval) => enxoval.id !== deletedId,
      );
      setEnxovais(remainingEnxovais);
      setIsDeleteEnxovalOpen(false);

      const nextEnxoval = remainingEnxovais[0];
      if (nextEnxoval) {
        const workspace = await fetchEnxovalRequest(nextEnxoval.id);
        applyWorkspace(workspace);
      } else {
        setActiveEnxoval(null);
        setSelectedEnxovalId(undefined);
        setMembers([]);
        setCategories([]);
        setItems([]);
        setActiveCategoryId("");
      }
    } catch (err) {
      setDialogError(
        err instanceof Error
          ? err.message
          : "Não foi possível excluir o enxoval.",
      );
    } finally {
      setIsDialogSubmitting(false);
    }
  };
  const handleLeaveEnxoval = async () => {
    if (!activeEnxoval || !user || activeEnxoval.role === "owner") return;

    setIsDialogSubmitting(true);
    setDialogError("");

    try {
      const leftId = activeEnxoval.id;
      await removeMemberRequest(leftId, user.id);

      const remainingEnxovais = enxovais.filter(
        (enxoval) => enxoval.id !== leftId,
      );
      setEnxovais(remainingEnxovais);
      setIsLeaveEnxovalOpen(false);

      const nextEnxoval = remainingEnxovais[0];
      if (nextEnxoval) {
        const workspace = await fetchEnxovalRequest(nextEnxoval.id);
        applyWorkspace(workspace);
      } else {
        storeEnxovalId(null);
        setActiveEnxoval(null);
        setSelectedEnxovalId(undefined);
        setMembers([]);
        setCategories([]);
        setItems([]);
        setActiveCategoryId("");
      }
    } catch (err) {
      setDialogError(
        err instanceof Error
          ? err.message
          : "Não foi possível sair do enxoval.",
      );
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleInviteMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeEnxoval) return;

    const email = inviteEmail.trim();
    if (!email) return;

    setIsDialogSubmitting(true);
    setDialogError("");

    setInviteNotice("");

    try {
      const invitation = await inviteMemberRequest(activeEnxoval.id, email);
      // Convidar de novo o mesmo e-mail só renova o convite pendente.
      setInvitations((current) => [
        invitation,
        ...current.filter((existing) => existing.id !== invitation.id),
      ]);
      setInviteNotice(`Convite enviado para ${invitation.email}.`);
      setInviteEmail("");
    } catch (err) {
      setDialogError(
        err instanceof Error
          ? err.message
          : "Não foi possível convidar essa pessoa.",
      );
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleRevokeInvitation = async (invitation: EnxovalInvitation) => {
    if (!activeEnxoval) return;
    setIsDialogSubmitting(true);
    setDialogError("");
    setInviteNotice("");

    try {
      await revokeInvitationRequest(activeEnxoval.id, invitation.id);
      setInvitations((current) =>
        current.filter((existing) => existing.id !== invitation.id),
      );
    } catch (err) {
      setDialogError(
        err instanceof Error
          ? err.message
          : "Não foi possível cancelar o convite.",
      );
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleRemoveMember = async (member: EnxovalMember) => {
    if (!activeEnxoval) return;
    // Primeiro toque pede a confirmação; o segundo remove de fato.
    if (memberToRemoveId !== member.id) {
      setMemberToRemoveId(member.id);
      return;
    }
    setIsDialogSubmitting(true);
    setDialogError("");
    setInviteNotice("");

    try {
      await removeMemberRequest(activeEnxoval.id, member.id);
      setMembers((current) =>
        current.filter((existing) => existing.id !== member.id),
      );
      setMemberToRemoveId("");
      setInviteNotice(`${member.name} não tem mais acesso a este enxoval.`);
    } catch (err) {
      setDialogError(
        err instanceof Error
          ? err.message
          : "Não foi possível remover essa pessoa.",
      );
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const openCreateEnxoval = () => {
    setDialogError("");
    setNewEnxovalName("");
    setNewEnxovalUseDefaultTemplate(true);
    setIsCreateEnxovalOpen(true);
  };

  const openCreateCategory = () => {
    setDialogError("");
    setNewCategoryName("");
    setIsCreateCategoryOpen(true);
  };

  const openRenameEnxoval = () => {
    if (!activeEnxoval) return;
    setDialogError("");
    setRenameEnxovalName(activeEnxoval.name);
    setIsRenameEnxovalOpen(true);
  };

  const openDiscounts = () => {
    if (!activeEnxoval) return;
    setDialogError("");
    setDiscountCategoryId(activeCategory?.id ?? categories[0]?.id ?? "");
    setDiscountItemId("");
    setDiscountText("");
    setIsDiscountsOpen(true);
  };

  const selectDiscountItem = (itemId: string) => {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    setDialogError("");
    setDiscountCategoryId(item.categoryId);
    setDiscountItemId(item.id);
    setDiscountText(
      item.discountCents > 0
        ? formatPriceInput(String(item.discountCents))
        : "",
    );
  };

  const saveItemDiscount = async (itemId: string, discountCents: number) => {
    setIsDialogSubmitting(true);
    setDialogError("");

    try {
      const savedItem = await updateItemRequest(itemId, { discountCents });
      setItems((current) =>
        current.map((item) => (item.id === itemId ? savedItem : item)),
      );
      // Escolhido o desconto, o formulário volta limpo para o próximo item.
      setDiscountItemId("");
      setDiscountText("");
    } catch (err) {
      setDialogError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar o desconto.",
      );
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleSaveDiscounts = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedDiscountItem) {
      setDialogError("Escolha o item que recebeu o desconto.");
      return;
    }
    const price = normalizePriceCents(selectedDiscountItem.priceCents) ?? 0;
    if (discountInputCents <= 0) {
      setDialogError("Informe o valor do desconto ou cashback.");
      return;
    }
    if (price <= 0) {
      setDialogError(
        "Informe o preço do item antes de registrar o desconto ou cashback.",
      );
      return;
    }
    if (discountInputCents > price) {
      setDialogError(
        "O desconto ou cashback não pode ser maior que o preço do item.",
      );
      return;
    }
    await saveItemDiscount(selectedDiscountItem.id, discountInputCents);
  };

  const removeGeneralDiscount = async () => {
    if (!activeEnxoval) return;

    setIsDialogSubmitting(true);
    setDialogError("");

    try {
      const updatedEnxoval = await updateEnxovalRequest(activeEnxoval.id, {
        discountCents: 0,
      });
      setActiveEnxoval(updatedEnxoval);
      setEnxovais((current) =>
        current.map((enxoval) =>
          enxoval.id === updatedEnxoval.id ? updatedEnxoval : enxoval,
        ),
      );
    } catch (err) {
      setDialogError(
        err instanceof Error
          ? err.message
          : "Não foi possível remover o desconto geral.",
      );
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const openDeleteEnxoval = () => {
    if (!activeEnxoval) return;
    setDialogError("");
    setIsDeleteEnxovalOpen(true);
  };

  const openLeaveEnxoval = () => {
    if (!activeEnxoval || activeEnxoval.role === "owner") return;
    setDialogError("");
    setIsLeaveEnxovalOpen(true);
  };

  const openInvite = () => {
    // Só o dono convida; quem foi convidado não tem esta ação.
    if (!activeEnxoval || activeEnxoval.role !== "owner") return;
    const enxovalId = activeEnxoval.id;
    setDialogError("");
    setInviteNotice("");
    setInviteEmail("");
    setMemberToRemoveId("");
    setInvitations([]);
    setIsInviteOpen(true);
    fetchInvitationsRequest(enxovalId)
      .then((pending) => setInvitations(pending))
      .catch((err) =>
        setDialogError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os convites pendentes.",
        ),
      );
  };

  const showAllItems = () => {
    setActiveCategoryId("");
    setWorkspaceView("list");
    setSearchQuery("");
    setItemSortMode("manual");
  };
  // Quem divide a lista vê, ao abrir, quantos itens mudaram desde a última visita deste aparelho
  // (o app não registra quem mudou; "Ver" abre a lista em Últimas alterações).
  const changesCheckedFor = useRef<string | null>(null);
  useEffect(() => {
    const enxovalId = activeEnxoval?.id;
    if (!enxovalId || isLoading || isWorkspaceLoading) return;
    const key = `casamia:ultima-visita:${enxovalId}`;
    const remember = () => {
      try {
        localStorage.setItem(key, String(Date.now()));
      } catch {
        // Sem armazenamento local (aba privada): o aviso só não aparece.
      }
    };
    if (changesCheckedFor.current !== enxovalId) {
      changesCheckedFor.current = enxovalId;
      let lastVisit = 0;
      try {
        lastVisit = Number(localStorage.getItem(key)) || 0;
      } catch {
        lastVisit = 0;
      }
      remember();
      const changed = lastVisit
        ? items.filter((item) => getUpdatedAtTime(item) > lastVisit).length
        : 0;
      // O app não guarda quem riscou: se mudou enquanto a pessoa estava fora, foi outra pessoa do enxoval.
      const takenOver = lastVisit
        ? items.filter(
            (item) =>
              item.assigneeId === user?.id &&
              isDoneStatus(item.status) &&
              getUpdatedAtTime(item) > lastVisit,
          )
        : [];
      if (members.length > 1 && takenOver.length > 0)
        showToast(
          takenOver.length === 1
            ? `${takenOver[0].name}, que estava com você, já foi conquistado.`
            : `${takenOver.length} itens que estavam com você já foram conquistados.`,
          () => {
            showAllItems();
            setItemSortMode("updated");
          },
          "Ver",
        );
      else if (members.length > 1 && changed > 0)
        showToast(
          `${changed} ${changed === 1 ? "item mudou" : "itens mudaram"} desde a sua última visita.`,
          () => {
            showAllItems();
            setItemSortMode("updated");
          },
          "Ver",
        );
    }
    // As mudanças feitas nesta visita não contam como novidade na próxima.
    const onHide = () => {
      if (document.visibilityState === "hidden") remember();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", remember);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", remember);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEnxoval?.id, isLoading, isWorkspaceLoading]);
  const selectEnvironment = (id: string) => {
    setActiveCategoryId(id);
    setWorkspaceView("list");
    setSearchQuery("");
    setItemSortMode("manual");
  };
  const commitEnvironmentOrder = async (ids: string[]) => {
    if (!activeEnxoval || isOrdering)
      throw new Error("Aguarde a operação atual.");
    setIsOrdering(true);
    setError("");
    try {
      setCategories(await reorderCategoriesRequest(activeEnxoval.id, ids));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar a ordem dos ambientes.",
      );
      throw err;
    } finally {
      setIsOrdering(false);
    }
  };
  const commitItemOrder = async (ids: string[]) => {
    if (!activeEnxoval || !activeCategory || isOrdering)
      throw new Error("Aguarde a operação atual.");
    setIsOrdering(true);
    setError("");
    try {
      const ordered = await reorderItemsRequest(
        activeEnxoval.id,
        activeCategory.id,
        ids,
      );
      const byId = new Map(ordered.map((item) => [item.id, item]));
      setItems((current) => current.map((item) => byId.get(item.id) ?? item));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar a ordem dos itens.",
      );
      throw err;
    } finally {
      setIsOrdering(false);
    }
  };
  const openRenameCategory = (category: EnxovalCategory) => {
    setCategoryToRename(category);
    setRenameCategoryName(category.name);
    setDialogError("");
  };
  const handleRenameCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeEnxoval || !categoryToRename) return;
    setIsDialogSubmitting(true);
    setDialogError("");
    try {
      const saved = await renameCategoryRequest(
        activeEnxoval.id,
        categoryToRename.id,
        normalizeEnvironmentName(renameCategoryName),
      );
      setCategories((current) =>
        current.map((category) =>
          category.id === saved.id ? saved : category,
        ),
      );
      setItems((current) =>
        current.map((item) =>
          item.categoryId === saved.id
            ? { ...item, category: saved.name }
            : item,
        ),
      );
      setCategoryToRename(null);
    } catch (err) {
      setDialogError(
        err instanceof Error
          ? err.message
          : "Não foi possível editar o ambiente.",
      );
    } finally {
      setIsDialogSubmitting(false);
    }
  };
  const deleteCategoryItemCount = categoryToDelete
    ? items.filter((item) => item.categoryId === categoryToDelete.id).length
    : 0;
  const openDeleteCategory = (category: EnxovalCategory) => {
    setCategoryToDelete(category);
    setDialogError("");
  };
  const handleDeleteCategory = async () => {
    if (!activeEnxoval || !categoryToDelete) return;
    setIsDialogSubmitting(true);
    setDialogError("");
    try {
      const deletedId = categoryToDelete.id;
      await deleteCategoryRequest(activeEnxoval.id, deletedId);
      const index = categories.findIndex(
        (category) => category.id === deletedId,
      );
      const remaining = categories.filter(
        (category) => category.id !== deletedId,
      );
      setCategories(remaining);
      setItems((current) =>
        current.filter((item) => item.categoryId !== deletedId),
      );
      if (activeCategory?.id === deletedId) setActiveCategoryId("");
      setCategoryToDelete(null);
    } catch (err) {
      setDialogError(
        err instanceof Error
          ? err.message
          : "Não foi possível excluir o ambiente.",
      );
    } finally {
      setIsDialogSubmitting(false);
    }
  };
  // Largura da barra lateral: cresce o bastante para o maior nome de ambiente caber inteiro, em uma linha.
  // Espaço fixo da linha (alça, ícone, contagem, editar, excluir e margens) somado à largura real do texto.
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    // A fonte da marca carrega depois da página: mede de novo quando ela chega.
    void document.fonts?.ready.then(() => setFontsTick((tick) => tick + 1));
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const sidebarWidth = useMemo(() => {
    const longest = categories.reduce(
      (max, category) =>
        Math.max(
          max,
          measureTextWidth(
            category.name,
            '13px "Nunito Variable", Nunito, ui-sans-serif, system-ui, sans-serif',
          ),
        ),
      0,
    );
    const wanted = Math.ceil(longest + SIDEBAR_ROW_CHROME);
    // Teto: a barra cresce até 60% da tela (e 960 px) para o maior nome caber inteiro. Passando disso, a barra rola de lado.
    const cap = Math.max(
      SIDEBAR_MIN_WIDTH,
      Math.min(Math.round(viewportWidth * 0.6), 960),
    );
    return Math.min(Math.max(wanted, SIDEBAR_MIN_WIDTH), cap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, viewportWidth, fontsTick]);

  // Itens cuja semana sugerida já passou: o Planejamento mostra quantos precisam de nova semana.
  const rescheduleCount = purchasePlan?.totals.overdueCount ?? 0;
  const sharedWithNames = members
    .filter((member) => member.id !== user?.id)
    .map((member) => member.name.split(" ")[0] || member.email)
    .join(", ");
  const nextStep = useMemo(
    () => pickNextStep(purchasePlan, activeCategory?.id, user?.id),
    [purchasePlan, activeCategory?.id, user?.id],
  );
  const showNextStep =
    Boolean(nextStep) &&
    !isSearching &&
    !hasItemFilters &&
    !isShowingLatestChanges;
  // Os atalhos olham o ambiente aberto (ou todos) e somem durante a busca e os outros filtros.
  const insightItems = useMemo(
    () =>
      activeCategory
        ? items.filter((item) => item.categoryId === activeCategory.id)
        : items,
    [activeCategory, items],
  );
  const listInsights = useMemo(
    () =>
      computeListInsights(insightItems, weekIdSet, Boolean(moveDate), {
        userId: user?.id,
        shared: members.length > 1,
      }),
    [insightItems, weekIdSet, moveDate, user?.id, members.length],
  );
  const hasOtherItemFilters = hasItemFilters && quickFilter === null;
  const showListInsights =
    !isSearching && !isShowingLatestChanges && !hasOtherItemFilters;
  const suggestionsForRoom = useMemo(
    () => (activeCategory ? roomSuggestions(activeCategory.name, items) : []),
    [activeCategory, items],
  );
  const showRoomSuggestions =
    Boolean(activeCategory) &&
    !isSearching &&
    !hasItemFilters &&
    !isShowingLatestChanges &&
    suggestionsForRoom.length > 0;
  const weekGroups = useMemo(
    () =>
      itemSortMode === "week"
        ? groupByBuyWeek(
            filteredItems,
            purchasePlan,
            moveDate,
            undefined,
            completionOrder.pendingIds,
          )
        : null,
    [
      filteredItems,
      itemSortMode,
      moveDate,
      purchasePlan,
      completionOrder.completions,
    ],
  );
  /** "Ver item" do próximo passo: leva até a linha e abre os detalhes, onde dá para riscar ou ajustar. */
  const openItemFromNextStep = (itemId: string) => {
    const row = document.querySelector<HTMLElement>(
      `[data-item-id="${itemId}"]`,
    );
    if (!row) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    row.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
    const title = row.querySelector<HTMLButtonElement>(".item-title-button");
    if (title && title.getAttribute("aria-expanded") !== "true") title.click();
    title?.focus({ preventScroll: true });
  };
  const renderItem = (item: EnxovalItem, dragHandle?: React.ReactNode) => {
    const planned = purchasePlan?.byId.get(item.id);
    return (
      <ItemRow
        key={item.id}
        item={item}
        completionExiting={
          completionOrder.completions.get(item.id)?.phase === "exiting"
        }
        categories={categories}
        dragHandle={dragHandle}
        buyPlan={
          planned
            ? {
                week: planned.placement.week,
                manual: planned.placement.source === "manual",
                reason: planned.placement.reason,
                moveDate: activeEnxoval?.moveDate ?? null,
                overdue: planned.overdue,
              }
            : undefined
        }
        // Dentro de um ambiente a etiqueta só repetiria o título da lista.
        categoryName={
          activeCategory && !isSearching && !isShowingLatestChanges
            ? undefined
            : (categoryById.get(item.categoryId)?.name ?? item.category)
        }
        showUpdatedAt={isShowingLatestChanges}
        updatedAtLabel={formatUpdatedAt(item.updatedAt)}
        onUpdate={updateItem}
        onReplace={replaceItem}
        members={members}
        currentUserId={user?.id}
        knownGiftNames={knownGiftNames}
        onDelete={openDeleteItem}
        onCompletionChange={({ id, name, previous, done }) =>
          showToast(
            done ? `Riscado da lista: ${name}.` : `${name} voltou para a fila.`,
            () => updateItem(id, { status: previous }),
          )
        }
      />
    );
  };
  // Nomes de quem já deu presente neste enxoval: o campo "De quem foi o presente?" sugere os mesmos.
  const knownGiftNames = useMemo(
    () =>
      [...new Set(items.map((item) => item.giftFrom?.trim()).filter(Boolean) as string[])].sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [items],
  );
  const canReorderItems =
    itemSortMode === "manual" &&
    !isSearching &&
    !hasItemFilters &&
    Boolean(activeCategory);

  const handleLogout = async () => {
    clearSubscriptionStatus();
    await logoutRequest().catch(() => undefined);
    clearSubscriptionStatus();
    window.history.replaceState({}, "", "/");
    storeEnxovalId(null);
    setUser(null);
    setEnxovais([]);
    setActiveEnxoval(null);
    setSelectedEnxovalId(undefined);
    workspaceRequestRef.current++;
    historyNavigationRef.current = false;
    setIsWorkspaceLoading(false);
    syncedRoutePathRef.current = null;
    setIsRenameEnxovalOpen(false);
    setIsDeleteEnxovalOpen(false);
    setIsDiscountsOpen(false);
    setItemToDelete(null);
    setCategoryToDelete(null);
    setMembers([]);
    setItems([]);
    setCategories([]);
    setActiveCategoryId("");
  };

  return {
    isLoading,
    user,
    completeAuthentication,
    handleLogout,
    bootstrapError,
    setBootstrapAttempt,
    needsOnboarding,
    enxovais,
    selectedEnxovalId,
    handleRefresh,
    activeEnxoval,
    workspaceView,
    sidebarWidth,
    isWorkspaceMenuOpen,
    setWorkspaceView,
    isAllEnvironments,
    showAllItems,
    items,
    hasEnxoval,
    categories,
    activeCategoryId,
    selectEnvironment,
    openRenameCategory,
    openDeleteCategory,
    commitEnvironmentOrder,
    isWorkspaceLoading,
    isOrdering,
    openCreateCategory,
    rescheduleCount,
    handleEnxovalChange,
    openCreateEnxoval,
    helpTriggerRef,
    setIsFeedbackOpen,
    openRenameEnxoval,
    members,
    sharedWithNames,
    isOwner,
    openInvite,
    openLeaveEnxoval,
    openDiscounts,
    openDeleteEnxoval,
    setIsProfileOpen,
    pullDistance,
    isRefreshing,
    headerStyle,
    titleStyle,
    eyebrowStyle,
    openWorkspaceMenu,
    chipsScrollRef,
    categoryBarStyle,
    error,
    ninoCelebration,
    updatePlanning,
    updateItem,
    addItem,
    enxovalDiscountCents,
    scopeItems,
    activeCategory,
    setActiveCategoryId,
    setSearchQuery,
    setItemSortMode,
    showUnpricedItems,
    isSearching,
    isShowingLatestChanges,
    filteredItems,
    setIsAddModalOpen,
    handleCategoryListPointerDown,
    handleCategoryListPointerMove,
    handleCategoryListPointerEnd,
    handleCategoryListPointerCancel,
    canSwipeCategories,
    categorySwipeAnimationClass,
    categorySwipeStyle,
    showNextStep,
    nextStep,
    moveDate,
    openItemFromNextStep,
    showListInsights,
    listInsights,
    quickFilter,
    setQuickFilter,
    assigneeFilter,
    setAssigneeFilter,
    replaceItem,
    showToast,
    showRoomSuggestions,
    suggestionsForRoom,
    searchScopeLabel,
    searchQuery,
    setIsFilterOpen,
    activeFilterCount,
    hasItemFilters,
    listTitle,
    listCounterText,
    canReorderItems,
    commitItemOrder,
    renderItem,
    weekGroups,
    setIsAddChoiceOpen,
    toast,
    setToast,
    isFeedbackOpen,
    menuTriggerRef,
    setIsWorkspaceMenuOpen,
    isAddChoiceOpen,
    categoryToRename,
    setCategoryToRename,
    isDialogSubmitting,
    handleRenameCategory,
    renameCategoryName,
    setRenameCategoryName,
    dialogError,
    isAddModalOpen,
    isFilterOpen,
    setShowOnlyPricedItems,
    setShowOnlyCheckedItems,
    setShowOnlyUnpricedItems,
    setStatusFilter,
    showOnlyPricedItems,
    showOnlyUnpricedItems,
    showOnlyCheckedItems,
    statusFilter,
    itemSortMode,
    isCreateCategoryOpen,
    setIsCreateCategoryOpen,
    handleCreateCategory,
    newCategoryName,
    setNewCategoryName,
    isCreateEnxovalOpen,
    setIsCreateEnxovalOpen,
    handleCreateEnxoval,
    newEnxovalName,
    setNewEnxovalName,
    setNewEnxovalUseDefaultTemplate,
    newEnxovalUseDefaultTemplate,
    isDiscountsOpen,
    setIsDiscountsOpen,
    handleSaveDiscounts,
    discountCategoryId,
    setDiscountCategoryId,
    setDiscountItemId,
    setDiscountText,
    setDialogError,
    discountItemId,
    discountItemOptions,
    selectDiscountItem,
    discountText,
    formatPriceInput,
    selectedDiscountItem,
    normalizePriceCents,
    formatCurrency,
    discountInputCents,
    registeredDiscountItems,
    categoryById,
    saveItemDiscount,
    savedDiscountText,
    removeGeneralDiscount,
    itemDiscountsTotalCents,
    receivedValueCents,
    receivedValueText,
    checkedTotalSpentCents,
    isRenameEnxovalOpen,
    setIsRenameEnxovalOpen,
    handleRenameEnxoval,
    renameEnxovalName,
    setRenameEnxovalName,
    isDeleteEnxovalOpen,
    setIsDeleteEnxovalOpen,
    handleDeleteEnxoval,
    isLeaveEnxovalOpen,
    setIsLeaveEnxovalOpen,
    handleLeaveEnxoval,
    categoryToDelete,
    setCategoryToDelete,
    deleteCategoryItemCount,
    handleDeleteCategory,
    itemToDelete,
    setItemToDelete,
    handleDeleteItem,
    isInviteOpen,
    setIsInviteOpen,
    handleInviteMember,
    inviteEmail,
    setInviteEmail,
    memberToRemoveId,
    handleRemoveMember,
    setMemberToRemoveId,
    invitations,
    handleRevokeInvitation,
    inviteNotice,
    isProfileOpen,
    setUser,
  };
}
