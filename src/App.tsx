import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { motion,MotionConfig } from "motion/react";
import React,{ lazy,Suspense } from "react";
import { DesktopActionsMenu } from "./components/DesktopActionsMenu";
import { ProfileDialog } from "./components/ProfileDialog";
import { SubscriptionAccess } from "./components/SubscriptionAccess";
import {
DropdownMenu,
DropdownMenuContent,
DropdownMenuItem,
DropdownMenuLabel,
DropdownMenuSeparator,
DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { WorkspaceAnalytics } from "./components/WorkspaceAnalytics";
import { WorkspaceDialogs } from "./components/WorkspaceDialogs";
import { WorkspaceLoading } from "./components/WorkspaceLoading";

import {
CalendarClock,
Check,
ChevronDown,
DoorOpen,
Home,
LayoutDashboard,
ListChecks,
ListPlus,
LogOut,
Menu,
MessageCircleHeart,
Pencil,
Percent,
Plus,
RefreshCw,
Trash2,
UserPlus,
UserRound,
} from "@/src/components/icons";
import { AuthPage } from "./components/AuthPage";
import { Brand } from "./components/Brand";
import { EmailVerificationPending } from "./components/EmailVerificationPage";
import { EnvironmentList } from "./components/EnvironmentList";
import { LandingPage } from "./components/LandingPage";
import { NoAccessPage } from "./components/NoAccessPage";
import { RequiredPasswordPage } from "./components/RequiredPasswordPage";
import { ScrollIndicator } from "./components/ScrollIndicator";
import { UndoToast } from "./components/UndoToast";
import { UserAvatar } from "./components/UserAvatar";
import { enxovalSelectOptions } from "./enxovais";
import { activeItems,doneItems } from "./itemStatus";
import { parseAppRoute } from "./appRoute";

import { useWorkspace } from "./hooks/useWorkspace";

const OverviewRoute = lazy(() => import("./routes/OverviewRoute"));
const ListRoute = lazy(() => import("./routes/ListRoute"));
const PlanRoute = lazy(() => import("./routes/PlanRoute"));
const StoreRoute = lazy(() => import("./routes/StoreRoute"));
const OfflineStore = lazy(() => import("./routes/OfflineStore"));

export default function App() {
  const workspace = useWorkspace();
  const {
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
    pullIndicatorRef,
    mobileHeaderRef,
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
    setIsAddChoiceOpen,
    toast,
    setToast,
    isProfileOpen,
    setUser,
    replaceItem,
    showToast,
  } = workspace;
  const overview = activeEnxoval ? (
    <OverviewRoute
      items={items}
      categories={categories}
      name={activeEnxoval!.name}
      enxovalId={activeEnxoval!.id}
      onImported={handleRefresh}
      onAddCategory={openCreateCategory}
      discountCents={enxovalDiscountCents}
      view={workspaceView === "list" ? "list" : "overview"}
      scope={
        scopeItems && activeCategory
          ? { name: activeCategory.name, items: scopeItems }
          : undefined
      }
      onCategory={(id) => {
        setActiveCategoryId(id);
        setWorkspaceView("list");
        setSearchQuery("");
        setItemSortMode("manual");
      }}
      onShowUnpriced={showUnpricedItems}
    />
  ) : null;

  if (!isLoading && user?.mustChangePassword)
    return (
      <RequiredPasswordPage
        user={user}
        onChanged={completeAuthentication}
        onLogout={handleLogout}
      />
    );

  if (window.location.pathname === "/")
    return <LandingPage signedIn={Boolean(user)} authLoading={isLoading} />;

  // Modo loja sem conexão: abre o retrato salvo no aparelho em vez da tela de erro.
  if (bootstrapError && parseAppRoute(window.location.pathname)?.view === "store") {
    return (
      <Suspense fallback={<WorkspaceLoading error={bootstrapError} retrying={false} onRetry={() => setBootstrapAttempt((attempt) => attempt + 1)} />}>
        <OfflineStore
          route={parseAppRoute(window.location.pathname)!}
          fallback={
            <WorkspaceLoading
              error={bootstrapError}
              retrying={isLoading}
              onRetry={() => setBootstrapAttempt((attempt) => attempt + 1)}
            />
          }
        />
      </Suspense>
    );
  }

  if (isLoading || bootstrapError) {
    return (
      <WorkspaceLoading
        error={bootstrapError}
        retrying={isLoading}
        onRetry={() => setBootstrapAttempt((attempt) => attempt + 1)}
      />
    );
  }

  if (!user) {
    return <AuthPage onAuthenticated={completeAuthentication} />;
  }

  if (user.emailVerified === false)
    return (
      <EmailVerificationPending
        user={user}
        onVerified={completeAuthentication}
        onLogout={handleLogout}
      />
    );

  if (needsOnboarding)
    return (
      <main className="subscription-page" aria-busy="true">
        Preparando seu onboarding…
      </main>
    );

  // Convidado removido de todos os enxovais: a conta continua existindo, mas sem nada para usar.
  if (user.isGuest && enxovais.length === 0) {
    return <NoAccessPage user={user} onLogout={() => void handleLogout()} />;
  }

  return (
    // As animações de layout (barra lateral, cabeçalho, listas) seguem a preferência de movimento reduzido do sistema.
    <MotionConfig reducedMotion="user">
      <SubscriptionAccess
        userId={user.id}
        enxovalId={selectedEnxovalId}
        onChanged={() => void handleRefresh()}
        onLogout={() => void handleLogout()}
      >
        <WorkspaceAnalytics
          userId={user.id}
          enxovalId={activeEnxoval?.id}
          view={workspaceView}
        />
        <div
          className={`workspace-app workspace-view-${workspaceView} min-h-screen pb-24 font-sans text-brand-dark overscroll-y-contain`}
          style={{ "--sidebar-w": `${sidebarWidth}px` } as React.CSSProperties}
        >
          <a className="skip-link" href="#workspace-main">
            Pular para a lista
          </a>
          <div inert={isWorkspaceMenuOpen}>
            {/* Barra fixa e com rolagem própria: sem layoutRoot/layoutScroll, o motion lê a rolagem da página
            como deslocamento dos ambientes e os anima "para baixo e de volta" ao trocar de ambiente. */}
            <motion.aside layoutRoot layoutScroll className="workspace-sidebar">
              <a href="/" className="brand-link">
                <Brand />
              </a>
              <nav
                className="workspace-navigation"
                aria-label="Navegação do enxoval"
              >
                <Button
                  variant="brand"
                  size="brand"
                  className={workspaceView === "overview" ? "active" : ""}
                  aria-current={
                    workspaceView === "overview" ? "page" : undefined
                  }
                  onClick={() => setWorkspaceView("overview")}
                >
                  <LayoutDashboard size={18} /> Meu Lar
                </Button>
                <Button
                  variant="brand"
                  size="brand"
                  className={
                    workspaceView === "list"
                      ? isAllEnvironments
                        ? "active"
                        : "is-parent"
                      : ""
                  }
                  aria-current={
                    workspaceView === "list" && isAllEnvironments
                      ? "page"
                      : undefined
                  }
                  onClick={showAllItems}
                >
                  <ListChecks size={18} /> Meu enxoval{" "}
                  <span aria-hidden="true">
                    {doneItems(items).length}/{items.length}
                  </span>
                  <span className="sr-only">
                    , {doneItems(items).length} de {items.length} conquistados
                  </span>
                </Button>
                {/* Os ambientes são filtros de "Meu enxoval": ficam recuados logo abaixo dele. */}
                {hasEnxoval && (
                  <div
                    className="sidebar-rooms"
                    role="group"
                    aria-label="Ambientes"
                  >
                    <EnvironmentList
                      categories={categories}
                      items={items}
                      activeId={
                        workspaceView === "list" ? activeCategoryId : undefined
                      }
                      onSelect={selectEnvironment}
                      onRename={openRenameCategory}
                      onDelete={openDeleteCategory}
                      onReorder={commitEnvironmentOrder}
                      disabled={isWorkspaceLoading || isOrdering}
                    />
                    <Button
                      variant="brand"
                      size="brand"
                      type="button"
                      className="sidebar-add-room"
                      onClick={openCreateCategory}
                      disabled={isWorkspaceLoading || isOrdering}
                    >
                      <Plus size={16} /> Novo ambiente
                    </Button>
                  </div>
                )}
                <Button
                  variant="brand"
                  size="brand"
                  className={workspaceView === "plan" ? "active" : ""}
                  aria-current={workspaceView === "plan" ? "page" : undefined}
                  onClick={() => setWorkspaceView("plan")}
                  disabled={!hasEnxoval}
                >
                  <CalendarClock size={18} /> Planejamento
                  {rescheduleCount > 0 && (
                    <span className="workspace-nav-note">
                      {rescheduleCount} a reagendar
                    </span>
                  )}
                </Button>
              </nav>
              {/* Todos os enxovais à vista: trocar é um clique e criar um novo não depende de achar o menu do título. */}
              {hasEnxoval && (enxovais.length > 1 || !user.isGuest) && (
                <section
                  className="sidebar-enxovais"
                  aria-labelledby="sidebar-enxovais-title"
                >
                  <h2 id="sidebar-enxovais-title">Seus enxovais</h2>
                  <ul>
                    {enxovalSelectOptions(enxovais).map(
                      (option, index, options) => {
                        const isCurrent = option.value === activeEnxoval?.id;
                        return (
                          <li key={option.value}>
                            {option.group &&
                              option.group !== options[index - 1]?.group && (
                                <span className="sidebar-enxovais-group">
                                  {option.group}
                                </span>
                              )}
                            <Button
                              variant="brand"
                              size="brand"
                              type="button"
                              className={`sidebar-enxoval${isCurrent ? " is-current" : ""}`}
                              aria-current={isCurrent ? "true" : undefined}
                              title={option.label}
                              disabled={isWorkspaceLoading || isOrdering}
                              onClick={() =>
                                isCurrent
                                  ? showAllItems()
                                  : void handleEnxovalChange(option.value)
                              }
                            >
                              <span
                                className="sidebar-enxoval-dot"
                                aria-hidden="true"
                              />
                              <span className="sidebar-enxoval-name">
                                {option.label}
                              </span>
                            </Button>
                          </li>
                        );
                      },
                    )}
                  </ul>
                  {!user.isGuest && (
                    <Button
                      variant="brand"
                      size="brand"
                      type="button"
                      className="sidebar-add-enxoval"
                      onClick={openCreateEnxoval}
                      disabled={isWorkspaceLoading || isOrdering}
                    >
                      <Plus size={16} /> Criar novo enxoval
                    </Button>
                  )}
                </section>
              )}
              <div className="sidebar-bottom">
                <Button
                  variant="brand"
                  size="brand"
                  type="button"
                  className="sidebar-help"
                  title="Relatar um problema ou sugerir uma melhoria"
                  onClick={(event) => {
                    helpTriggerRef.current = event.currentTarget;
                    setIsFeedbackOpen(true);
                  }}
                >
                  <MessageCircleHeart size={18} /> Ajuda e sugestões
                </Button>
              </div>
            </motion.aside>
            <div className="desktop-app-header">
              <span>
                {/* O nome do enxoval é o próprio seletor: trocar e criar ficam no mesmo lugar onde o nome aparece. */}
                <h1>
                  {hasEnxoval && (enxovais.length > 1 || !user.isGuest) ? (
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="brand"
                          size="brand"
                          type="button"
                          className="enxoval-switcher-trigger"
                          disabled={isWorkspaceLoading || isOrdering}
                        >
                          <span className="enxoval-switcher-name">
                            {activeEnxoval?.name}
                          </span>
                          <span className="sr-only">: trocar de enxoval</span>
                          <ChevronDown size={18} aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        sideOffset={8}
                        collisionPadding={12}
                        className="desktop-actions-popup enxoval-switcher-popup"
                        aria-label="Seus enxovais"
                      >
                        {enxovalSelectOptions(enxovais).map(
                          (option, index, options) => (
                            <React.Fragment key={option.value}>
                              {option.group &&
                                option.group !== options[index - 1]?.group && (
                                  <DropdownMenuLabel className="enxoval-switcher-group">
                                    {option.group}
                                  </DropdownMenuLabel>
                                )}
                              <DropdownMenuItem asChild>
                                <Button
                                  variant="brand"
                                  size="brand"
                                  type="button"
                                  className="desktop-menu-item"
                                  aria-current={
                                    option.value === activeEnxoval?.id
                                      ? "true"
                                      : undefined
                                  }
                                  onClick={() =>
                                    void handleEnxovalChange(option.value)
                                  }
                                >
                                  <span className="enxoval-switcher-option">
                                    {option.label}
                                  </span>
                                  {option.value === activeEnxoval?.id && (
                                    <Check size={16} aria-hidden="true" />
                                  )}
                                </Button>
                              </DropdownMenuItem>
                            </React.Fragment>
                          ),
                        )}
                        {!user.isGuest && (
                          <>
                            <DropdownMenuSeparator className="desktop-menu-separator" />
                            <DropdownMenuItem asChild>
                              <Button
                                variant="brand"
                                size="brand"
                                type="button"
                                className="desktop-menu-item"
                                onClick={openCreateEnxoval}
                              >
                                <Plus size={16} /> Criar novo enxoval
                              </Button>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    (activeEnxoval?.name ?? "Bem-vindo ao Casa Mia")
                  )}
                </h1>
                {activeEnxoval?.role === "owner" && (
                  <>
                    <Button
                      variant="brand"
                      size="brand"
                      className="title-edit-button"
                      aria-label="Editar nome do enxoval"
                      onClick={openRenameEnxoval}
                    >
                      <Pencil size={15} />
                    </Button>
                  </>
                )}
                {members.length > 1 && (
                  <span
                    className="member-avatars"
                    role="img"
                    aria-label={`Compartilhado com ${sharedWithNames}`}
                    title={`Compartilhado com ${sharedWithNames}`}
                  >
                    {members.slice(0, 3).map((member) => (
                      <span key={member.id} aria-hidden="true">
                        {member.name.trim().charAt(0).toUpperCase()}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <div className="desktop-account-actions">
                <DesktopActionsMenu
                  name={user.name}
                  email={user.email}
                  avatarUrl={user.avatarUrl}
                >
                  {hasEnxoval && (
                    <>
                      {isOwner ? (
                        <DropdownMenuItem asChild>
                          <Button
                            variant="brand"
                            size="brand"
                            className="desktop-menu-item"
                            onClick={openInvite}
                          >
                            <UserPlus size={16} /> Convidar
                          </Button>
                        </DropdownMenuItem>
                      ) : (
                        <>
                          <Badge asChild variant="outline">
                            <span className="shared-badge">
                              Convidado de {activeEnxoval?.ownerName}
                            </span>
                          </Badge>
                          <DropdownMenuItem asChild>
                            <Button
                              variant="brand"
                              size="brand"
                              type="button"
                              className="desktop-menu-item"
                              onClick={openLeaveEnxoval}
                            >
                              <DoorOpen size={16} /> Sair do enxoval
                            </Button>
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem asChild>
                        <Button
                          variant="brand"
                          size="brand"
                          className="desktop-menu-item"
                          aria-label="Descontos e cashback"
                          title="Descontos e cashback"
                          onClick={openDiscounts}
                        >
                          <Percent size={16} /> Descontos
                        </Button>
                      </DropdownMenuItem>
                      {/* Longe do lápis do título: apagar o enxoval de vocês dois não pode estar a um toque errado. */}
                      {isOwner && (
                        <DropdownMenuItem asChild>
                          <Button
                            variant="brand"
                            size="brand"
                            type="button"
                            className="desktop-menu-item desktop-menu-item-danger"
                            onClick={openDeleteEnxoval}
                          >
                            <Trash2 size={16} /> Excluir enxoval
                          </Button>
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                  <DropdownMenuItem asChild>
                    <Button
                      variant="brand"
                      size="brand"
                      type="button"
                      className="desktop-menu-item"
                      onClick={() => setIsProfileOpen(true)}
                    >
                      <UserRound size={16} /> Meu perfil
                    </Button>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="desktop-menu-separator" />
                  <DropdownMenuItem asChild>
                    <Button
                      variant="brand"
                      size="brand"
                      type="button"
                      className="desktop-menu-item"
                      aria-label="Central de ajuda: relatar um problema ou sugerir uma melhoria"
                      title="Relatar um problema ou sugerir uma melhoria"
                      onClick={(event) => {
                        helpTriggerRef.current =
                          document.querySelector<HTMLButtonElement>(
                            ".desktop-actions-trigger",
                          ) ?? event.currentTarget;
                        setIsFeedbackOpen(true);
                      }}
                    >
                      <MessageCircleHeart size={16} /> Ajuda e sugestões
                    </Button>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Button
                      variant="brand"
                      size="brand"
                      type="button"
                      className="desktop-menu-item"
                      aria-label="Sair da conta"
                      onClick={() => void handleLogout()}
                    >
                      <LogOut size={16} /> Sair
                    </Button>
                  </DropdownMenuItem>
                </DesktopActionsMenu>
              </div>
            </div>
            <div className="mobile-app-brand">
              <a href="/" className="brand-link">
                <Brand />
              </a>
            </div>
            {/* Posição, opacidade e giro vêm da variável --pull (escrita pelo gesto, sem renderizar o app). */}
            <div
              ref={pullIndicatorRef}
              aria-hidden="true"
              className="pull-refresh-indicator pointer-events-none fixed left-1/2 top-3 z-50 sm:hidden"
              data-refreshing={isRefreshing}
            >
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand-wood shadow-md ring-1 ring-stone-200">
                <RefreshCw size={17} className={isRefreshing ? "animate-spin" : "pull-refresh-icon"} />
              </div>
            </div>
            <motion.header
              ref={mobileHeaderRef}
              layoutRoot
              className="mobile-workspace-header mobile-header-clean sticky top-0 z-20"
              style={headerStyle}
            >
              <div className="mobile-header-title-row">
                <div className="mobile-header-title">
                  <div className="mobile-title-with-edit">
                    <h1 style={titleStyle}>
                      {activeEnxoval?.name ?? "Meu enxoval"}
                    </h1>
                    {activeEnxoval?.role === "owner" && (
                      <Button
                        variant="brand"
                        size="brand"
                        className="title-edit-button"
                        aria-label="Editar nome do enxoval"
                        onClick={openRenameEnxoval}
                      >
                        <Pencil size={17} />
                      </Button>
                    )}
                  </div>
                  {/* Quem divide a lista, dito pelo nome (antes era um rótulo em caixa-alta acima do título). */}
                  {members.length > 1 && (
                    <p className="mobile-header-shared" style={eyebrowStyle}>
                      Compartilhado com {sharedWithNames}
                    </p>
                  )}
                </div>
                <Button
                  variant="brand"
                  size="brand"
                  type="button"
                  className="mobile-header-profile"
                  aria-label="Abrir meu perfil"
                  title="Meu perfil"
                  onClick={() => setIsProfileOpen(true)}
                >
                  <UserAvatar name={user.name} src={user.avatarUrl} />
                </Button>
                <Button
                  variant="brand"
                  size="brand"
                  type="button"
                  className="workspace-menu-trigger workspace-menu-trigger-icon"
                  aria-label="Abrir menu do enxoval"
                  aria-expanded={isWorkspaceMenuOpen}
                  aria-controls="workspace-menu"
                  onClick={openWorkspaceMenu}
                >
                  <Menu size={26} strokeWidth={1.8} aria-hidden="true" />
                </Button>
              </div>
              {hasEnxoval && workspaceView === "list" && (
                <>
                  <motion.div
                    layoutScroll
                    ref={chipsScrollRef}
                    className="environment-tabs-scroll no-scrollbar"
                    style={categoryBarStyle}
                  >
                    <EnvironmentList
                      categories={categories}
                      items={items}
                      activeId={activeCategoryId}
                      onSelect={selectEnvironment}
                      onRename={openRenameCategory}
                      onReorder={commitEnvironmentOrder}
                      disabled={isWorkspaceLoading || isOrdering}
                      allOption={{
                        active: isAllEnvironments,
                        onSelect: showAllItems,
                        done: doneItems(items).length,
                        total: activeItems(items).length,
                      }}
                      horizontal
                    />
                  </motion.div>
                  <ScrollIndicator targetRef={chipsScrollRef} />
                </>
              )}
            </motion.header>

            <main id="workspace-main" className="workspace-main">
              {error && (
                <div className="form-error workspace-error" role="alert">
                  {error}
                </div>
              )}

              {isWorkspaceLoading && (
                <div className="mb-4 text-sm text-stone-500 bg-white border border-stone-200 rounded-lg px-3 py-2">
                  Carregando enxoval...
                </div>
              )}

              <Suspense
                fallback={
                  <p role="status" aria-live="polite">
                    Carregando tela…
                  </p>
                }
              >
                {hasEnxoval && workspaceView === "plan" && (
                  <PlanRoute
                    key={activeEnxoval!.id}
                    ninoCelebration={ninoCelebration}
                    enxoval={activeEnxoval!}
                    items={items}
                    categories={categories}
                    canEdit={isOwner}
                    onUpdateEnxoval={updatePlanning}
                    onUpdateItem={(id, updates) => updateItem(id, updates)}
                    onAddItem={(name, categoryId, categoryName) =>
                      addItem(name, categoryId, categoryName)
                    }
                  />
                )}
                {hasEnxoval && workspaceView === "store" && (
                  <StoreRoute
                    key={activeEnxoval!.id}
                    enxoval={activeEnxoval!}
                    items={items}
                    categories={categories}
                    categoryId={activeCategoryId}
                    onCategory={setActiveCategoryId}
                    onExit={() => {
                      setWorkspaceView("list");
                      window.scrollTo({ top: 0 });
                    }}
                    onSaved={(saved) => saved.forEach(replaceItem)}
                    showToast={showToast}
                  />
                )}
                {hasEnxoval && workspaceView === "overview" && overview}
                {hasEnxoval && workspaceView === "list" && (
                  <ListRoute workspace={workspace} overview={overview} />
                )}
              </Suspense>
              {!hasEnxoval ? (
                <div className="min-h-[45vh] flex items-center justify-center px-2">
                  <div className="text-center max-w-sm">
                    <Home className="w-12 h-12 text-brand-wood mx-auto mb-4" />
                    <h2 className="font-serif text-2xl font-bold text-stone-900 mb-2">
                      Crie seu primeiro enxoval
                    </h2>
                    <p className="text-sm text-stone-500 mb-6">
                      Comece com a lista sugerida ou monte uma lista vazia.
                    </p>
                    <Button
                      variant="brand"
                      size="brand"
                      type="button"
                      onClick={openCreateEnxoval}
                      className="button button-dark"
                    >
                      <ListPlus size={18} />
                      Criar enxoval
                    </Button>
                  </div>
                </div>
              ) : null}
            </main>

            <nav
              className="mobile-bottom-nav"
              aria-label="Navegação do aplicativo"
            >
              <Button
                variant="brand"
                size="brand"
                className={workspaceView === "overview" ? "active" : ""}
                aria-current={workspaceView === "overview" ? "page" : undefined}
                onClick={() => {
                  setWorkspaceView("overview");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <LayoutDashboard size={19} />
                Meu Lar
              </Button>
              <Button
                variant="brand"
                size="brand"
                className={workspaceView === "list" ? "active" : ""}
                aria-current={workspaceView === "list" ? "page" : undefined}
                onClick={showAllItems}
              >
                <ListChecks size={19} />
                Meu enxoval
              </Button>
              <Button
                variant="brand"
                size="brand"
                className={workspaceView === "plan" ? "active" : ""}
                aria-current={workspaceView === "plan" ? "page" : undefined}
                onClick={() => {
                  setWorkspaceView("plan");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                disabled={!hasEnxoval}
              >
                <CalendarClock size={19} />
                Planejamento
              </Button>
            </nav>
            <Button
              variant="brand"
              size="brand"
              type="button"
              className={`mobile-fab-add${toast ? " has-undo-toast" : ""}`}
              aria-label="Adicionar item ou ambiente"
              aria-haspopup="dialog"
              onClick={() => setIsAddChoiceOpen(true)}
              disabled={!hasEnxoval}
            >
              <Plus size={26} strokeWidth={2.5} aria-hidden="true" />
            </Button>
            <UndoToast message={toast} onDismiss={() => setToast(null)} />
          </div>
          <WorkspaceDialogs workspace={workspace} />
        </div>
      </SubscriptionAccess>
      <ProfileDialog
        open={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
        enxoval={activeEnxoval}
        onChanged={() => void handleRefresh()}
        onUserChanged={(profile) =>
          setUser((current) =>
            current
              ? { ...current, name: profile.name, avatarUrl: profile.avatarUrl }
              : current,
          )
        }
      />
    </MotionConfig>
  );
}
