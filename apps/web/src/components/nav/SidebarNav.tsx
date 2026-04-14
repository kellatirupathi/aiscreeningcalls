import {
  Building2,
  BookOpen,
  Boxes,
  ChevronDown,
  Hash,
  LayoutDashboard,
  LogOut,
  Menu,
  PhoneCall,
  PhoneForwarded,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthStore } from "@/stores/authStore";
import type { UserRole } from "@/types";

const navItems = [
  { label: "Agent Setup", to: "/agents", icon: LayoutDashboard, roles: ["admin", "manager"] as UserRole[] },
  { label: "Call History", to: "/calls", icon: PhoneCall, roles: ["admin", "manager", "recruiter", "viewer"] as UserRole[] },
  { label: "My Numbers", to: "/numbers", icon: Hash, roles: ["admin", "manager"] as UserRole[] },
  { label: "Batches", to: "/batches", icon: Boxes, roles: ["admin", "manager", "recruiter", "viewer"] as UserRole[] },
  { label: "Campaigns", to: "/campaigns", icon: PhoneForwarded, roles: ["admin", "manager", "recruiter", "viewer"] as UserRole[] },
  { label: "Documentation", to: "/documentation", icon: BookOpen, roles: ["admin", "manager", "recruiter", "viewer"] as UserRole[] }
];

const accountItems = [
  { label: "Workspace Account", to: "/settings/workspace", icon: Building2, roles: ["admin"] as UserRole[] }
];

export function SidebarNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const triggerWrapRef = useRef<HTMLDivElement | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const { data: currentUser } = useCurrentUser();
  const { clearSession, email, role, setSession, userName, workspaceName } = useAuthStore();

  useEffect(() => {
    if (currentUser) {
      setSession(currentUser);
    }
  }, [currentUser, setSession]);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  const updateMenuPosition = useCallback(() => {
    if (!triggerButtonRef.current || !menuPanelRef.current) {
      return;
    }

    const triggerRect = triggerButtonRef.current.getBoundingClientRect();
    const menuRect = menuPanelRef.current.getBoundingClientRect();
    const gap = 14;
    const viewportPadding = 12;

    const left = Math.min(triggerRect.right + gap, window.innerWidth - menuRect.width - viewportPadding);
    const top = Math.max(
      viewportPadding,
      Math.min(triggerRect.bottom - menuRect.height, window.innerHeight - menuRect.height - viewportPadding)
    );

    setMenuPosition({ top, left });
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (triggerWrapRef.current?.contains(target) || menuPanelRef.current?.contains(target)) {
        return;
      }

      setIsMenuOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(updateMenuPosition);

    function handleViewportChange() {
      updateMenuPosition();
    }

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isMenuOpen, updateMenuPosition]);

  const normalizedRole = (currentUser?.role || role || "admin").toLowerCase();
  const displayName = currentUser?.name || userName || "Workspace Admin";
  const displayEmail = currentUser?.email || email || "No email configured";
  const displayWorkspace = currentUser?.organization?.name || workspaceName || "Workspace";
  const workspaceSlug = currentUser?.organization?.slug || "workspace";
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => item.roles.includes(normalizedRole as UserRole)),
    [normalizedRole]
  );
  const visibleAccountItems = useMemo(
    () => accountItems.filter((item) => item.roles.includes(normalizedRole as UserRole)),
    [normalizedRole]
  );
  const canViewNumbers = normalizedRole === "admin" || normalizedRole === "manager";
  const canViewWorkspaceSettings = normalizedRole === "admin";
  const avatarLabel = useMemo(() => {
    const source = displayName || displayWorkspace;
    return source.trim().charAt(0).toUpperCase() || "W";
  }, [displayName, displayWorkspace]);

  async function handleLogout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore logout transport issues for local scaffold
    } finally {
      clearSession();
      navigate("/login", { replace: true });
    }
  }

  const accountMenu = (
    <div
      ref={menuPanelRef}
      className="sidebar__account-menu sidebar__account-menu--floating"
      style={{ top: menuPosition.top, left: menuPosition.left }}
    >
      <div className="sidebar__account-menu-header">
        <div className="sidebar__avatar">{avatarLabel}</div>
        <div className="sidebar__account-meta">
          <strong>{displayName}</strong>
          <span>{displayEmail}</span>
        </div>
      </div>

      {canViewWorkspaceSettings ? (
        <NavLink to="/settings/workspace" className="sidebar__account-action">
          <Building2 size={17} />
          <span>Workspace account</span>
        </NavLink>
      ) : null}
      {canViewNumbers ? (
        <NavLink to="/numbers" className="sidebar__account-action">
          <Hash size={17} />
          <span>Verified numbers</span>
        </NavLink>
      ) : null}
      <button type="button" className="sidebar__account-action sidebar__account-action--logout" onClick={handleLogout}>
        <LogOut size={17} />
        <span>Log out</span>
      </button>
    </div>
  );

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar__masthead">
          <div className="sidebar__wave-logo" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <strong>NXTWAVE</strong>
          </div>
        </div>

        {visibleNavItems.length > 0 ? <div className="sidebar__section-label">Platform</div> : null}
        <nav className="sidebar__nav">
          {visibleNavItems.map(({ label, to, icon: Icon }) =>
            to === "/documentation" ? (
              <a
                key={label}
                href={to}
                target="_blank"
                rel="noreferrer"
                className={`sidebar__link ${location.pathname === to ? "sidebar__link--active" : ""}`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </a>
            ) : (
              <NavLink
                key={label}
                to={to}
                className={({ isActive }) => `sidebar__link ${isActive ? "sidebar__link--active" : ""}`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            )
          )}
        </nav>

        {visibleAccountItems.length > 0 ? <div className="sidebar__section-label">Account</div> : null}
        <nav className="sidebar__nav">
          {visibleAccountItems.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={label}
              to={to}
              className={({ isActive }) => `sidebar__link ${isActive ? "sidebar__link--active" : ""}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__profile-wrap" ref={triggerWrapRef}>
          <button type="button" className="sidebar__profile" ref={triggerButtonRef} onClick={() => setIsMenuOpen((value) => !value)}>
            <div className="sidebar__avatar">{avatarLabel}</div>
            <div className="sidebar__profile-copy">
              <strong>{displayName}</strong>
              <span>{workspaceSlug}</span>
            </div>
            <ChevronDown size={16} />
          </button>
        </div>
      </aside>

      {isMenuOpen ? createPortal(accountMenu, document.body) : null}
    </>
  );
}
