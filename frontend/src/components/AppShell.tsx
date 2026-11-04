import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Moon,
  PanelLeft,
  PanelRight,
  Palette,
  Sun,
} from "lucide-react";

import { navigationItems } from "@/data/navigation";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LensPanel } from "@/components/LensPanel";
import { BrandLogo } from "@/components/BrandLogo";
import { APP_NAME } from "@/lib/brand";
import { getHealth, getNote } from "@/services/api";
import { getAIHealth } from "@/services/ai";
import { WorkspaceCommandLayer } from "@/components/WorkspaceCommandLayer";
import { useWorkspaceUi } from "@/stores/workspace-ui";

function NavigationLinks({
  collapsed = false,
  mobile = false,
}: {
  collapsed?: boolean;
  mobile?: boolean;
}) {
  return navigationItems.map(({ icon: Icon, label, path }) => {
    const link = (
      <NavLink
        aria-label={label}
        className={({ isActive }) =>
          `${mobile ? "mobile-nav-link" : "rail-nav-link"}${isActive ? " is-active" : ""}`
        }
        end={path === "/"}
        key={path}
        title={label}
        to={path}
      >
        <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
        <span className={mobile ? undefined : "rail-label"}>{label}</span>
      </NavLink>
    );

    if (mobile || !collapsed) {
      return link;
    }

    return (
      <Tooltip key={path}>
        <TooltipTrigger render={link} />
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  });
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const Icon = isDark ? Sun : Moon;

  function handleToggle() {
    toggleTheme();
    toast.add({
      title: `${nextTheme === "light" ? "Light" : "Dark"} theme`,
      description: "Your preference is saved in this browser.",
      type: "success",
    });
  }

  return (
    <Button
      aria-label={`Switch to ${nextTheme} theme`}
      onClick={handleToggle}
      size="icon"
      title={`Switch to ${nextTheme} theme`}
      variant="ghost"
    >
      <Icon aria-hidden="true" size={17} />
    </Button>
  );
}

function pageTitle(pathname: string): string {
  const item = navigationItems.find((navigationItem) =>
    navigationItem.path === "/"
      ? pathname === "/"
      : pathname.startsWith(navigationItem.path),
  );
  return item?.label ?? (pathname === "/dev/design" ? "Design system" : APP_NAME);
}

export function AppShell() {
  const { pathname } = useLocation();
  const selectedNoteId = useWorkspaceUi((state) => state.selectedNoteId);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [lensCollapsed, setLensCollapsed] = useState(false);
  const [lensOpen, setLensOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState<
    | { state: "checking" }
    | { state: "connected" }
    | { state: "unavailable"; error: string }
  >({ state: "checking" });
  const aiStatus = useQuery({
    queryKey: ["aiHealth"],
    queryFn: getAIHealth,
    refetchInterval: 30_000,
    retry: false,
  });
  const selectedNote = useQuery({
    queryKey: ["note", selectedNoteId],
    queryFn: () => getNote(selectedNoteId!),
    enabled: pathname.startsWith("/notes") && selectedNoteId !== null,
  });
  const title = pathname.startsWith("/notes")
    ? selectedNote.data?.title || pageTitle(pathname)
    : pageTitle(pathname);
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
  useEffect(() => {
    let active = true;
    getHealth()
      .then(() => {
        if (active) setBackendStatus({ state: "connected" });
      })
      .catch((reason: unknown) => {
        if (active) {
          setBackendStatus({
            state: "unavailable",
            error: reason instanceof Error ? reason.message : "Unknown error",
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const toggleRail = useCallback(() => setRailCollapsed((collapsed) => !collapsed), []);
  const toggleLens = useCallback(() => {
    if (window.matchMedia("(max-width: 768px)").matches) {
      setLensOpen((current) => !current);
    } else {
      setLensCollapsed((current) => !current);
    }
  }, []);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div
        className="app-shell"
        data-lens-collapsed={lensCollapsed}
        data-rail-collapsed={railCollapsed}
      >
        <aside aria-label="Primary navigation" className="app-rail">
          <Link aria-label={`${APP_NAME} home`} className="rail-brand" to="/">
            <BrandLogo alt={`${APP_NAME} home`} className="rail-brand-logo" height={32} width={96} />
          </Link>
          <p className="rail-caption">Workspace</p>
          <nav aria-label="Workspace" className="rail-navigation">
            <TooltipProvider delay={250}>
              <NavigationLinks collapsed={railCollapsed} />
            </TooltipProvider>
          </nav>
          <div className="rail-footer">
            <Link
              aria-label="Open design system"
              className="rail-footer-link"
              title="Design system"
              to="/dev/design"
            >
              <Palette aria-hidden="true" size={14} />
              <span className="rail-footer-text">Design system</span>
            </Link>
            <Button
              aria-label={railCollapsed ? "Expand navigation" : "Collapse navigation"}
              className="rail-toggle desktop-only"
              onClick={() => setRailCollapsed((collapsed) => !collapsed)}
              size="icon-sm"
              title="Toggle navigation (Ctrl+B)"
              variant="ghost"
            >
              <PanelLeft aria-hidden="true" size={16} />
            </Button>
          </div>
        </aside>

        <div className="shell-main">
          <header className="shell-header">
            <Link aria-label={`${APP_NAME} home`} className="mobile-header-brand" to="/">
              <BrandLogo alt={`${APP_NAME} home`} height={20} width={60} />
            </Link>
            <div className="header-title">{pageTitle(pathname)}</div>
            <div className="header-actions">
              <div
                aria-label={
                  aiStatus.data?.mock
                    ? "Demo Mode active. AI responses are mock."
                    : aiStatus.data?.reachable && aiStatus.data.chat_model_present
                      ? `Local AI connected (${aiStatus.data.chat_model}).`
                      : "Local AI not connected. Notes, search, links, and the graph still work."
                }
                className="status-indicator ai-status-indicator"
                role="status"
                title={
                  aiStatus.data?.mock
                    ? "Demo Mode active; responses are labeled as mock."
                    : aiStatus.data?.reachable && aiStatus.data.chat_model_present
                      ? `Local AI connected (${aiStatus.data.chat_model}).`
                      : "Local AI not connected. Notes, search, links, and the graph still work."
                }
              >
                <span
                  aria-hidden="true"
                  className={`status-dot${aiStatus.data?.mock || aiStatus.data?.reachable && aiStatus.data.chat_model_present ? "" : " status-dot--checking"}`}
                />
                <span className="status-indicator-label">
                  {aiStatus.isPending
                    ? "Checking local AI"
                    : aiStatus.data?.mock
                      ? "Demo Mode (mock)"
                      : aiStatus.data?.reachable && aiStatus.data.chat_model_present
                        ? `Local AI connected (${aiStatus.data.chat_model})`
                        : "Local AI not connected. Notes, search, links, and the graph still work."}
                </span>
              </div>
              <span aria-hidden="true" className="header-divider" />
              <div
                aria-label={
                  backendStatus.state === "unavailable"
                    ? `Backend unavailable: ${backendStatus.error}`
                    : backendStatus.state === "checking"
                      ? "Checking backend connection"
                      : "Backend: connected"
                }
                className="status-indicator"
                role="status"
              >
                <span
                  className={`status-dot${backendStatus.state === "unavailable" ? " status-dot--error" : backendStatus.state === "checking" ? " status-dot--checking" : ""}`}
                  aria-hidden="true"
                />
                <span className="status-indicator-label">
                  {backendStatus.state === "unavailable"
                    ? "Backend unavailable"
                    : backendStatus.state === "checking"
                      ? "Checking backend"
                      : "Backend: connected"}
                </span>
              </div>
              <span aria-hidden="true" className="header-divider" />
              <Button
                aria-label="Open Lens panel"
                className="mobile-only"
                onClick={() => setLensOpen(true)}
                size="icon"
                title="Open Lens panel"
                variant="ghost"
              >
                <PanelRight aria-hidden="true" size={17} />
              </Button>
              <ThemeToggle />
            </div>
          </header>
          <main className="page-main" id="main-content" tabIndex={-1}>
            <Outlet />
          </main>
        </div>

        <aside aria-label="Lens panel" className={`lens-aside${lensCollapsed ? " is-collapsed" : ""}`}>
          {lensCollapsed ? (
            <Button
              aria-label="Expand Lens panel"
              onClick={() => setLensCollapsed(false)}
              size="icon"
              title="Expand Lens panel"
              variant="ghost"
            >
              <PanelRight aria-hidden="true" size={17} />
            </Button>
          ) : (
            <LensPanel onCollapse={() => setLensCollapsed(true)} showCollapse />
          )}
        </aside>

        <nav aria-label="Mobile navigation" className="mobile-navigation">
          <NavigationLinks mobile />
        </nav>
      </div>

      <Dialog onOpenChange={setLensOpen} open={lensOpen}>
        <DialogContent className="lens-dialog" showCloseButton>
          <DialogTitle className="sr-only">Lens panel</DialogTitle>
          <LensPanel />
        </DialogContent>
      </Dialog>
      <WorkspaceCommandLayer onToggleLens={toggleLens} onToggleRail={toggleRail} />
    </>
  );
}
