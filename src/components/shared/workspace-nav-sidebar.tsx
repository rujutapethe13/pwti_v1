"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Grid3X3,
  Bot,
  Star,
  ListChecks,
  MoreHorizontal,
  Search,
  Pencil,
  Copy,
  Trash2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Settings,
  Table2,
  Heart,
  File,
  Folder,
  Sparkles,
  Plus,
  BarChart3,
  Upload,
  Download,
  FileText,
  FolderPlus,
  MousePointer2,
  Layout,
  Columns,
  Check,
  RectangleHorizontal,
} from "lucide-react";

type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>;

export interface Workspace {
  id: string;
  name: string;
  initial: string;
  color: string;
  isDefault?: boolean;
}

export interface RailItem {
  id: string;
  label: string;
  icon: IconType;
}

export interface ContentItem {
  id: string;
  label: string;
  icon: IconType;
  iconColor?: string;
}

/* -- Design tokens --------------------------------------------- */
const BLUE = "#0073ea";
const BLUE_BG = "#e8f2ff";
const HOVER_BG = "#f5f6f8";
const BORDER = "#e6e9ef";
const TEXT = "#323338";
const MUTED = "#676879";
const MUTED2 = "#9699a6";
const DANGER = "#d83a52";
const SHADOW = "0 4px 16px rgba(0,0,0,0.12)";
const RADIUS = 8;
const ROW_RADIUS = 6;

export const SAMPLE_WORKSPACES: Workspace[] = [
  { id: "ws-1", name: "Production Studio", initial: "P", color: "#fd7e14", isDefault: true },
  { id: "ws-2", name: "Marketing Team", initial: "M", color: "#37b24d" },
  { id: "ws-3", name: "Client Projects", initial: "C", color: "#e64980" },
  { id: "ws-4", name: "Archived Work", initial: "A", color: "#9094a0" },
];

export const RAIL_ITEMS: RailItem[] = [
  { id: "workspace", label: "Workspace", icon: Grid3X3 },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "my-work", label: "My work", icon: ListChecks },
  { id: "more", label: "More", icon: MoreHorizontal },
];

export const CONTENT_ITEMS: ContentItem[] = [
  { id: "manage", label: "Manage workspace", icon: Settings },
  { id: "may", label: "MAY", icon: Table2 },
  { id: "june", label: "JUNE", icon: Table2 },
  { id: "july", label: "July", icon: Table2 },
  { id: "august", label: "August", icon: Table2 },
  { id: "vibe", label: "Build Vibe app", icon: Heart, iconColor: "#e91e63" },
];

/* -- Shared popover shell -------------------------------------- */
function PopoverShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        zIndex: 50,
        width: "100%",
        background: "#fff",
        border: "1px solid " + BORDER,
        borderRadius: RADIUS,
        boxShadow: SHADOW,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

/* -- Small colored avatar square ------------------------------- */
function AvatarSquare({ initial, color }: { initial: string; color: string }) {
  return (
    <div
      style={{
        width: 24, height: 24, borderRadius: 6, background: color,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}
    >
      <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{initial}</span>
    </div>
  );
}

/* -- Icon button (header toolbar) ------------------------------ */
const IconButton = React.forwardRef<HTMLButtonElement, { onClick?: () => void; title: string; children: React.ReactNode }>(
  function IconButton({ onClick, title, children }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={title}
        title={title}
        onClick={onClick}
        style={{
          width: 28, height: 28, borderRadius: 6, border: "none",
          background: "transparent", color: MUTED, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "background 0.12s ease",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {children}
      </button>
    );
  }
);

/* -- Group header (collapsible) -------------------------------- */
function GroupHeader({ label, expanded, onToggle, children }: { label: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          width: "100%", padding: "6px 6px", borderRadius: ROW_RADIUS, border: "none",
          background: "transparent", cursor: "pointer", textAlign: "left",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = HOVER_BG)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <ChevronRight
          style={{
            width: 14, height: 14, color: MUTED, flexShrink: 0,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
          aria-hidden="true"
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{label}</span>
      </button>
      {children}
    </div>
  );
}

/* -- Menu row (popover item) ----------------------------------- */
function MenuRow({ onClick, children, danger, chevron, active }: {
  onClick?: () => void; children: React.ReactNode; danger?: boolean; chevron?: boolean; active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8,
        padding: "6px 8px", borderRadius: ROW_RADIUS, border: "none",
        background: active ? BLUE_BG : "transparent", color: danger ? DANGER : TEXT,
        cursor: "pointer", fontSize: 13, fontWeight: 500, textAlign: "left",
        transition: "background 0.12s ease",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = HOVER_BG; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      {children}
      {chevron && <ChevronRight style={{ marginLeft: "auto", width: 14, height: 14, color: MUTED }} />}
    </button>
  );
}

/* -- Menu section label ---------------------------------------- */
function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "6px 8px 2px", fontSize: 11, fontWeight: 600, color: MUTED2, textTransform: "uppercase", letterSpacing: "0.02em" }}>
      {children}
    </div>
  );
}

/* -- Divider inside popovers ----------------------------------- */
function MenuDivider() {
  return <div style={{ height: 1, background: BORDER, margin: "4px 0" }} />;
}

/* -- Workspace switcher popover -------------------------------- */
function WorkspaceSwitcherPopover({
  anchorRef,
  workspaces,
  activeId,
  search,
  onSearch,
  onSelect,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  workspaces: Workspace[];
  activeId: string;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (w: Workspace) => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const container = el.closest("[data-nav-container]") as HTMLElement | null;
    const scrollLeft = container ? container.scrollLeft : 0;
    const scrollTop = container ? container.scrollTop : 0;
    setPos({ top: rect.bottom + scrollTop + 4, left: rect.left + scrollLeft });
  }, [anchorRef]);

  const q = search.trim().toLowerCase();
  const filtered = q ? workspaces.filter((w) => w.name.toLowerCase().includes(q)) : workspaces;
  const recent = filtered.filter((w) => w.isDefault).slice(0, 1);
  const rest = filtered.filter((w) => !w.isDefault);

  return (
    <div
      data-nav-popover
      style={{ position: "fixed", top: pos.top, left: pos.left, width: 280, zIndex: 100 }}
      onClick={(e) => e.stopPropagation()}
    >
      <PopoverShell>
        <div style={{ padding: "6px 8px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 6px 8px" }}>
            <Search style={{ width: 15, height: 15, color: MUTED2, flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search for a workspace"
              autoFocus
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontSize: 13, color: TEXT,
              }}
            />
          </div>
        </div>

        {recent.length > 0 && (
          <div>
            <MenuLabel>Recent workspaces</MenuLabel>
            {recent.map((w) => (
              <WorkspaceRow key={w.id} workspace={w} active={w.id === activeId} onSelect={onSelect} />
            ))}
          </div>
        )}

        {rest.length > 0 && (
          <div>
            <MenuLabel>My workspaces</MenuLabel>
            {rest.map((w) => (
              <WorkspaceRow key={w.id} workspace={w} active={w.id === activeId} onSelect={onSelect} />
            ))}
          </div>
        )}

        <MenuDivider />
        <MenuRow onClick={onClose} chevron>
          <Grid3X3 style={{ width: 15, height: 15, color: MUTED }} /> Browse all
        </MenuRow>
        <MenuRow onClick={onClose} chevron>
          <Plus style={{ width: 15, height: 15, color: MUTED }} /> Add workspace
        </MenuRow>
      </PopoverShell>
    </div>
  );
}

function WorkspaceRow({ workspace, active, onSelect }: { workspace: Workspace; active?: boolean; onSelect: (w: Workspace) => void }) {
  return (
    <MenuRow onClick={() => onSelect(workspace)} active={active}>
      <AvatarSquare initial={workspace.initial} color={workspace.color} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workspace.name}</span>
    </MenuRow>
  );
}


/* -- Add New popover ------------------------------------------- */
function AddNewPopover({
  anchorRef,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [anchorRef]);

  const showSub = (key: string) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setOpenSub(key);
  };
  const hideSub = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setOpenSub(null), 120);
  };

  return (
    <div
      data-nav-popover
      style={{ position: "fixed", top: pos.top, left: pos.left, width: 220, zIndex: 100 }}
      onClick={(e) => e.stopPropagation()}
      onMouseLeave={hideSub}
    >
      <PopoverShell>
        <div style={{ padding: "4px 4px" }}>
          <div style={{ padding: "4px 6px 6px", fontSize: 11, fontWeight: 600, color: MUTED2, textTransform: "uppercase", letterSpacing: "0.02em" }}>Add new</div>

          <MenuRow onClick={onClose}>
            <Sparkles style={{ width: 15, height: 15, color: MUTED }} /> Agent
          </MenuRow>
          <MenuRow onClick={onClose}>
            <Heart style={{ width: 15, height: 15, color: MUTED }} /> Vibe app
          </MenuRow>

          <div onMouseEnter={() => showSub("board")} onMouseLeave={hideSub} data-submenu-anchor="board" style={{ position: "relative" }}>
            <MenuRow chevron>
              <RectangleHorizontal style={{ width: 15, height: 15, color: MUTED }} /> Board
            </MenuRow>
          </div>

          <div onMouseEnter={() => showSub("doc")} onMouseLeave={hideSub} data-submenu-anchor="doc" style={{ position: "relative" }}>
            <MenuRow chevron>
              <FileText style={{ width: 15, height: 15, color: MUTED }} /> Doc
            </MenuRow>
          </div>

          <MenuRow onClick={onClose}>
            <BarChart3 style={{ width: 15, height: 15, color: MUTED }} /> Dashboard
          </MenuRow>

          <MenuDivider />

          <MenuRow onClick={onClose}>
            <Folder style={{ width: 15, height: 15, color: MUTED }} /> Folder
          </MenuRow>
          <MenuRow onClick={onClose}>
            <Sparkles style={{ width: 15, height: 15, color: MUTED }} /> Template center
          </MenuRow>

          <MenuDivider />

          <div onMouseEnter={() => showSub("more")} onMouseLeave={hideSub} data-submenu-anchor="more" style={{ position: "relative" }}>
            <MenuRow chevron>
              <MoreHorizontal style={{ width: 15, height: 15, color: MUTED }} /> More
            </MenuRow>
          </div>
        </div>
      </PopoverShell>

      {openSub === "board" && <SubmenuPane anchor="board" onEnter={() => showSub("board")} onLeave={hideSub} />}
      {openSub === "doc" && <SubmenuPane anchor="doc" onEnter={() => showSub("doc")} onLeave={hideSub} />}
      {openSub === "more" && <SubmenuPane anchor="more" onEnter={() => showSub("more")} onLeave={hideSub} />}
    </div>
  );
}

function SubmenuPane({
  anchor,
  onEnter,
  onLeave,
}: {
  anchor: string;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const el = document.querySelector(`[data-nav-popover] [data-submenu-anchor="${anchor}"]`) as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.right + 4 });
  }, [anchor]);

  let items: React.ReactNode = null;
  if (anchor === "board") {
    items = (
      <>
        <MenuRow onClick={() => {}}>New Board</MenuRow>
        <MenuRow onClick={() => {}}>New multi-level board</MenuRow>
        <MenuRow onClick={() => {}}>Start with template</MenuRow>
      </>
    );
  } else if (anchor === "doc") {
    items = (
      <>
        <MenuRow onClick={() => {}}>New blank doc</MenuRow>
        <MenuRow onClick={() => {}}>Start with template</MenuRow>
      </>
    );
  } else if (anchor === "more") {
    items = (
      <>
        <MenuRow onClick={() => {}}>
          <Upload style={{ width: 15, height: 15, color: MUTED }} /> Import files
        </MenuRow>
        <MenuRow onClick={() => {}}>
          <Download style={{ width: 15, height: 15, color: MUTED }} /> Export files
        </MenuRow>
      </>
    );
  }

  return (
    <div
      style={{ position: "fixed", top: pos.top, left: pos.left, width: 220, zIndex: 110 }}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <PopoverShell>
        <div style={{ padding: "4px 4px" }}>{items}</div>
      </PopoverShell>
    </div>
  );
}


/* -- Workspace panel (Panel B) --------------------------------- */
function WorkspacePanel(props: {
  activeWorkspace: Workspace;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  activeContentId: string;
  myAgentsExpanded: boolean;
  contentExpanded: boolean;
  wsPillRef: React.RefObject<HTMLButtonElement | null>;
  addBtnRef: React.RefObject<HTMLButtonElement | null>;
  moreBtnRef: React.RefObject<HTMLButtonElement | null>;
  wsMenuOpen: boolean;
  addMenuOpen: boolean;
  moreMenuOpen: boolean;
  wsSearch: string;
  onWsMenuOpen: () => void;
  onAddMenuOpen: () => void;
  onMoreMenuOpen: () => void;
  onWsSearch: (v: string) => void;
  onSelectWorkspace: (w: Workspace) => void;
  onWsMenuClose: () => void;
  onAddMenuClose: () => void;
  onMoreMenuClose: () => void;
  onCollapse: () => void;
  onToggleAgents: () => void;
  onToggleContent: () => void;
  onActivateContent: (id: string) => void;
}) {
  const {
    activeWorkspace, workspaces, activeWorkspaceId, activeContentId,
    myAgentsExpanded, contentExpanded, wsPillRef, addBtnRef, moreBtnRef,
    wsMenuOpen, addMenuOpen, moreMenuOpen, wsSearch,
    onWsMenuOpen, onAddMenuOpen, onMoreMenuOpen, onWsSearch,
    onSelectWorkspace, onWsMenuClose, onAddMenuClose, onMoreMenuClose,
    onCollapse, onToggleAgents, onToggleContent, onActivateContent,
  } = props;

  return (
    <aside
      style={{
        width: 280, flexShrink: 0, height: "100vh",
        background: "#fff", borderRight: "1px solid " + BORDER,
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Row 1 - Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: TEXT, flex: 1 }}>Workspace</span>
        <IconButton title="Search" onClick={() => {}}>
          <Search style={{ width: 16, height: 16 }} />
        </IconButton>
        <IconButton title="More" onClick={onMoreMenuOpen} ref={moreBtnRef}>
          <MoreHorizontal style={{ width: 16, height: 16 }} />
        </IconButton>
        <IconButton title="Collapse" onClick={onCollapse}>
          <ChevronLeft style={{ width: 16, height: 16 }} />
        </IconButton>
      </div>

      {/* Row 2 - Switcher bar */}
      <div style={{ display: "flex", gap: 6, padding: "0 12px 12px", alignItems: "center" }}>
        <button
          ref={wsPillRef}
          type="button"
          onClick={onWsMenuOpen}
          style={{
            flex: 1, display: "flex", alignItems: "center", gap: 6,
            height: 32, borderRadius: 6, border: "1px solid " + BORDER,
            background: "#fff", cursor: "pointer", padding: "0 6px",
            transition: "border-color 0.12s ease, box-shadow 0.12s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = MUTED2; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; }}
        >
          <AvatarSquare initial={activeWorkspace.initial} color={activeWorkspace.color} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 600, color: TEXT }}>{activeWorkspace.name}</span>
          <ChevronDown style={{ width: 14, height: 14, color: MUTED, flexShrink: 0 }} />
        </button>
        <button
          ref={addBtnRef}
          type="button"
          aria-label="Add new"
          onClick={onAddMenuOpen}
          style={{
            width: 32, height: 32, borderRadius: 6, border: "1px solid " + BORDER,
            background: "#fff", color: MUTED, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "background 0.12s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = HOVER_BG)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
        >
          <Plus style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Row 3+ - Scrollable content list */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ padding: "4px 8px" }}>
          <GroupHeader
            label="My agents"
            expanded={myAgentsExpanded}
            onToggle={onToggleAgents}
          >
            {myAgentsExpanded ? (
              <div style={{ padding: "2px 8px 8px", fontSize: 13, color: MUTED2 }}>No agents yet</div>
            ) : null}
          </GroupHeader>

          <GroupHeader
            label="Content"
            expanded={contentExpanded}
            onToggle={onToggleContent}
          >
            {contentExpanded && (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {CONTENT_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === activeContentId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onActivateContent(item.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        width: "100%", padding: "5px 6px", borderRadius: ROW_RADIUS,
                        border: "none", background: active ? BLUE_BG : "transparent",
                        color: active ? BLUE : TEXT, cursor: "pointer",
                        fontSize: 14, fontWeight: active ? 600 : 400,
                        transition: "background 0.12s ease, color 0.12s ease",
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = HOVER_BG; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                    >
                      <Icon style={{ width: 16, height: 16, flexShrink: 0, color: item.iconColor ?? (active ? BLUE : MUTED) }} aria-hidden="true" />
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </GroupHeader>
        </div>
      </div>
    </aside>
  );
}
