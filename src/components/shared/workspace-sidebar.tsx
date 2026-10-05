"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  Copy,
  Download,
  FileText,
  FolderClosed,
  Heart,
  Import,
  LayoutGrid,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Star,
  Table2,
  Trash2,
} from "lucide-react";
import { useWorkspace, type ContentItem as WsContentItem } from "@/lib/workspace-context";

type Icon = LucideIcon;

interface RailItem {
  id: string;
  label: string;
  icon: Icon;
}

interface Workspace {
  id: string;
  name: string;
  initial: string;
  color: string;
  isDefault?: boolean;
}

interface ContentItem {
  id: string;
  label: string;
  icon: Icon;
  iconColor?: string;
}

const RAIL_ITEMS: RailItem[] = [
  { id: "workspace", label: "Workspace", icon: LayoutGrid },
  { id: "agents", label: "Agents", icon: Bot },
];

const RAIL_ITEMS_BOTTOM: RailItem[] = [
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "mywork", label: "My work", icon: CheckSquare },
];

const ICON_MAP: Record<string, Icon> = {
  Settings2,
  FileText,
  Users: Bot,
  Receipt: FileText,
  Palette: LayoutGrid,
  Bot,
  LayoutGrid,
  Table2,
  Heart,
  BarChart3,
  Network,
  Sparkles,
  FolderClosed,
  Star,
};

function contentItemToSidebar(item: WsContentItem): ContentItem | null {
  const icon = ICON_MAP[item.icon ?? ""] ?? LayoutGrid;
  return {
    id: item.id,
    label: item.name,
    icon,
  };
}

const submenuStyle: CSSProperties = {
  position: "absolute",
  left: "100%",
  top: 0,
  marginLeft: 4,
  width: 200,
  background: "#fff",
  border: "1px solid #e6e9ef",
  borderRadius: 8,
  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
  padding: 6,
  zIndex: 60,
};

function useClickOutside(ref: { current: HTMLElement | null }, onOutside: () => void) {
  useEffect(() => {
    function handle(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutside();
      }
    }

    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ref, onOutside]);
}

function Divider() {
  return <div style={{ height: 1, background: "#e6e9ef", margin: "6px 0" }} />;
}

function MenuRow({
  icon: Icon,
  label,
  onClick,
  hasSubmenu,
  danger,
  iconColor,
}: {
  icon?: Icon;
  label: string;
  onClick?: () => void;
  hasSubmenu?: boolean;
  danger?: boolean;
  iconColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        padding: "8px 12px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        borderRadius: 6,
        fontSize: 14,
        color: danger ? "#d83a52" : "#323338",
        textAlign: "left",
        gap: 10,
        boxSizing: "border-box",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = "#f5f6f8";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
    >
      {Icon && (
        <Icon
          size={16}
          color={danger ? "#d83a52" : iconColor || "#676879"}
          strokeWidth={2}
        />
      )}
      <span style={{ flex: 1 }}>{label}</span>
      {hasSubmenu && <ChevronRight size={14} color="#9699a6" />}
    </button>
  );
}

function TripleDotMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 34,
        right: 0,
        width: 200,
        background: "#fff",
        border: "1px solid #e6e9ef",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        padding: 6,
        zIndex: 50,
      }}
    >
      <MenuRow icon={Pencil} label="Rename workspace" onClick={onClose} />
      <MenuRow icon={Copy} label="Duplicate workspace" onClick={onClose} />
      <Divider />
      <MenuRow icon={Trash2} label="Delete workspace" onClick={onClose} danger />
    </div>
  );
}

function WorkspaceRow({
  ws,
  active,
  onClick,
}: {
  ws: Workspace;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "7px 8px",
        border: "none",
        borderRadius: 6,
        background: active ? "#e8f2ff" : "transparent",
        cursor: "pointer",
        textAlign: "left",
        boxSizing: "border-box",
      }}
      onMouseEnter={(event) => {
        if (!active) event.currentTarget.style.background = "#f5f6f8";
      }}
      onMouseLeave={(event) => {
        if (!active) event.currentTarget.style.background = "transparent";
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          background: ws.color,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {ws.initial}
      </div>
      <span style={{ fontSize: 14, color: "#323338" }}>{ws.name}</span>
    </button>
  );
}

function WorkspaceSwitcher({
  onClose,
  current,
  onSelect,
  workspaces,
}: {
  onClose: () => void;
  current: Workspace | null;
  onSelect: (workspace: Workspace) => void;
  workspaces: Workspace[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);
  const [query, setQuery] = useState("");
  const filtered = workspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 44,
        left: 0,
        width: 280,
        background: "#fff",
        border: "1px solid #e6e9ef",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        padding: 10,
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid #d0d4e4",
          borderRadius: 6,
          padding: "7px 10px",
          marginBottom: 10,
        }}
      >
        <Search size={15} color="#9699a6" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for a workspace"
          aria-label="Search for a workspace"
          style={{
            border: "none",
            outline: "none",
            fontSize: 13,
            flex: 1,
            color: "#323338",
            minWidth: 0,
          }}
        />
      </div>

      <div
        style={{ fontSize: 12, color: "#9699a6", fontWeight: 600, padding: "4px 8px" }}
      >
        Recent workspaces
      </div>
      {filtered.slice(0, 1).map((workspace) => (
        <WorkspaceRow
          key={workspace.id}
          ws={workspace}
          active={workspace.id === current?.id}
          onClick={() => {
            onSelect(workspace);
            onClose();
          }}
        />
      ))}

      <div
        style={{
          fontSize: 12,
          color: "#9699a6",
          fontWeight: 600,
          padding: "10px 8px 4px",
        }}
      >
        My workspaces
      </div>
      {filtered.map((workspace) => (
        <WorkspaceRow
          key={workspace.id}
          ws={workspace}
          active={workspace.id === current?.id}
          onClick={() => {
            onSelect(workspace);
            onClose();
          }}
        />
      ))}

      <Divider />
      <MenuRow icon={LayoutGrid} label="Browse all" onClick={onClose} />
      <MenuRow icon={Plus} label="Add workspace" onClick={onClose} />
    </div>
  );
}

function AddNewMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);
  const [submenu, setSubmenu] = useState<"board" | "doc" | "more" | null>(null);

  const submenuContent = {
    board: [
      { icon: LayoutGrid, label: "New Board" },
      { icon: Network, label: "New multi-level board" },
      { icon: Sparkles, label: "Start with template" },
    ],
    doc: [
      { icon: FileText, label: "New blank doc" },
      { icon: Sparkles, label: "Start with template" },
    ],
    more: [
      { icon: Import, label: "Import files" },
      { icon: Download, label: "Export files" },
    ],
  };

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 44,
        left: 0,
        width: 220,
        background: "#fff",
        border: "1px solid #e6e9ef",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        padding: 6,
        zIndex: 50,
      }}
    >
      <div
        style={{ fontSize: 12, color: "#9699a6", fontWeight: 600, padding: "6px 12px" }}
      >
        Add new
      </div>

      <MenuRow icon={Bot} label="Agent" onClick={onClose} />
      <MenuRow icon={Heart} label="Vibe app" onClick={onClose} />

      <div
        style={{ position: "relative" }}
        onMouseEnter={() => setSubmenu("board")}
        onMouseLeave={() =>
          setSubmenu((current) => (current === "board" ? null : current))
        }
      >
        <MenuRow icon={Table2} label="Board" hasSubmenu />
        {submenu === "board" && (
          <div style={submenuStyle}>
            {submenuContent.board.map((item) => (
              <MenuRow
                key={item.label}
                icon={item.icon}
                label={item.label}
                onClick={onClose}
              />
            ))}
          </div>
        )}
      </div>

      <div
        style={{ position: "relative" }}
        onMouseEnter={() => setSubmenu("doc")}
        onMouseLeave={() => setSubmenu((current) => (current === "doc" ? null : current))}
      >
        <MenuRow icon={FileText} label="Doc" hasSubmenu />
        {submenu === "doc" && (
          <div style={submenuStyle}>
            {submenuContent.doc.map((item) => (
              <MenuRow
                key={item.label}
                icon={item.icon}
                label={item.label}
                onClick={onClose}
              />
            ))}
          </div>
        )}
      </div>

      <MenuRow icon={BarChart3} label="Dashboard" onClick={onClose} />

      <Divider />
      <MenuRow icon={FolderClosed} label="Folder" onClick={onClose} />
      <MenuRow icon={Sparkles} label="Template center" onClick={onClose} />

      <Divider />
      <div
        style={{ position: "relative" }}
        onMouseEnter={() => setSubmenu("more")}
        onMouseLeave={() =>
          setSubmenu((current) => (current === "more" ? null : current))
        }
      >
        <MenuRow icon={MoreHorizontal} label="More" hasSubmenu />
        {submenu === "more" && (
          <div style={submenuStyle}>
            {submenuContent.more.map((item) => (
              <MenuRow
                key={item.label}
                icon={item.icon}
                label={item.label}
                onClick={onClose}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RailButton({
  item,
  active,
  onClick,
  style,
}: {
  item: RailItem;
  active: boolean;
  onClick: () => void;
  style?: CSSProperties;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        width: 56,
        padding: "8px 4px",
        marginBottom: 4,
        border: "none",
        borderRadius: 8,
        background: active ? "#e8f2ff" : "transparent",
        cursor: "pointer",
        ...style,
      }}
      onMouseEnter={(event) => {
        if (!active) event.currentTarget.style.background = "#f5f6f8";
      }}
      onMouseLeave={(event) => {
        if (!active) event.currentTarget.style.background = "transparent";
      }}
    >
      <Icon size={19} color={active ? "#0073ea" : "#676879"} strokeWidth={2} />
      <span
        style={{
          fontSize: 11,
          color: active ? "#0073ea" : "#676879",
          fontWeight: active ? 600 : 500,
        }}
      >
        {item.label}
      </span>
    </button>
  );
}

function IconButton({
  icon: Icon,
  onClick,
  rotate,
  label,
}: {
  icon: Icon;
  onClick?: () => void;
  rotate?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        border: "none",
        borderRadius: 6,
        background: "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = "#f5f6f8";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
      aria-label={label}
    >
      <Icon
        size={16}
        color="#676879"
        style={rotate ? { transform: "rotate(180deg)" } : undefined}
      />
    </button>
  );
}

function GroupHeader({
  label,
  expanded,
  onClick,
}: {
  label: string;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        padding: "8px 6px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 700,
        color: "#323338",
        textAlign: "left",
      }}
      aria-expanded={expanded}
    >
      <ChevronDown
        size={14}
        color="#9699a6"
        style={{
          transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform 0.15s",
        }}
      />
      {label}
    </button>
  );
}

function ContentRow({
  item,
  active,
  onClick,
}: {
  item: ContentItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "7px 8px",
        border: "none",
        borderRadius: 6,
        background: active ? "#e8f2ff" : "transparent",
        cursor: "pointer",
        textAlign: "left",
        marginBottom: 1,
        boxSizing: "border-box",
      }}
      onMouseEnter={(event) => {
        if (!active) event.currentTarget.style.background = "#f5f6f8";
      }}
      onMouseLeave={(event) => {
        if (!active) event.currentTarget.style.background = "transparent";
      }}
    >
      <Icon
        size={16}
        color={item.iconColor || (active ? "#0073ea" : "#676879")}
        strokeWidth={2}
      />
      <span
        style={{
          fontSize: 14,
          color: active ? "#0073ea" : "#323338",
          fontWeight: active ? 600 : 400,
        }}
      >
        {item.label}
      </span>
    </button>
  );
}

export default function WorkspaceSidebar() {
  const {
    workspaces,
    activeWorkspace,
    switchWorkspace,
    sidebarCollapsed,
  } = useWorkspace();
  const [activeRail, setActiveRail] = useState("workspace");
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);
  const [openMenu, setOpenMenu] = useState<"more" | "switcher" | "add" | null>(null);
  const [agentsExpanded, setAgentsExpanded] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(true);
  const [activeContentItem, setActiveContentItem] = useState<string | null>(null);

  useEffect(() => {
    setCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed]);

  const closeMenu = () => setOpenMenu(null);

  const toggleMenu = (menu: "more" | "switcher" | "add") => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  const sidebarWorkspaces: Workspace[] = (workspaces ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    initial: w.name.charAt(0).toUpperCase(),
    color: w.color,
    isDefault: w.isDefault,
  }));

  const sidebarContent: ContentItem[] = (activeWorkspace?.content ?? [])
    .map((item) => contentItemToSidebar(item))
    .filter((item): item is ContentItem => item !== null);

  const currentWs: Workspace | null = activeWorkspace
    ? {
        id: activeWorkspace.id,
        name: activeWorkspace.name,
        initial: activeWorkspace.name.charAt(0).toUpperCase(),
        color: activeWorkspace.color,
        isDefault: activeWorkspace.isDefault,
      }
    : null;

  const handleCollapse = () => {
    setCollapsed(true);
    closeMenu();
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily:
          "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: 72,
          borderRight: "1px solid #e6e9ef",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 16,
          flexShrink: 0,
        }}
      >
        {RAIL_ITEMS.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            active={activeRail === item.id}
            onClick={() => {
              setActiveRail(item.id);
              closeMenu();
            }}
          />
        ))}

        <div style={{ width: 36, height: 1, background: "#e6e9ef", margin: "10px 0" }} />

        {RAIL_ITEMS_BOTTOM.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            active={activeRail === item.id}
            onClick={() => {
              setActiveRail(item.id);
              closeMenu();
            }}
          />
        ))}

        <div style={{ flex: 1 }} />

        <RailButton
          item={{ id: "more", label: "More", icon: MoreHorizontal }}
          active={activeRail === "more"}
          onClick={() => {
            setActiveRail("more");
            closeMenu();
          }}
          style={{ marginBottom: 16 }}
        />
      </div>

      {!collapsed && (
        <div
          style={{
            width: 280,
            borderRight: "1px solid #e6e9ef",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 14px 10px",
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, color: "#323338" }}>
              Workspace
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                position: "relative",
              }}
            >
              <IconButton icon={Search} label="Search" />
              <div style={{ position: "relative" }}>
                <IconButton
                  icon={MoreHorizontal}
                  label="Workspace options"
                  onClick={() => toggleMenu("more")}
                />
                {openMenu === "more" && <TripleDotMenu onClose={closeMenu} />}
              </div>
              <IconButton
                icon={ChevronsLeft}
                label="Collapse sidebar"
                onClick={handleCollapse}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 14px 14px",
            }}
          >
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => toggleMenu("switcher")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "6px 8px",
                  border: "1px solid #e6e9ef",
                  borderRadius: 6,
                  background: openMenu === "switcher" ? "#e8f2ff" : "#fff",
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
                aria-expanded={openMenu === "switcher"}
              >
{currentWs ? (
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: currentWs.color,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {currentWs.initial}
                  </div>
                ) : null}
                <span
                  style={{
                    fontSize: 14,
                    color: "#323338",
                    fontWeight: 600,
                    flex: 1,
                    textAlign: "left",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                >
                  {currentWs?.name ?? "Select workspace"}
                </span>
                <ChevronDown size={15} color="#9699a6" />
              </button>
              {openMenu === "switcher" && (
                <WorkspaceSwitcher
                  current={currentWs}
                  workspaces={sidebarWorkspaces}
                  onSelect={(workspace) => {
                    switchWorkspace(workspace.id);
                    closeMenu();
                  }}
                  onClose={closeMenu}
                />
              )}
            </div>

            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => toggleMenu("add")}
                style={{
                  width: 32,
                  height: 32,
                  border: "1px solid #e6e9ef",
                  borderRadius: 6,
                  background: openMenu === "add" ? "#f5f6f8" : "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
                aria-label="Add new"
                aria-expanded={openMenu === "add"}
              >
                <Plus size={16} color="#323338" />
              </button>
              {openMenu === "add" && <AddNewMenu onClose={closeMenu} />}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
            <GroupHeader
              label="My agents"
              expanded={agentsExpanded}
              onClick={() => setAgentsExpanded((current) => !current)}
            />
            {agentsExpanded && (
              <div style={{ padding: "4px 0 8px 4px", fontSize: 13, color: "#9699a6" }}>
                No agents yet
              </div>
            )}

            <GroupHeader
              label="Content"
              expanded={contentExpanded}
              onClick={() => setContentExpanded((current) => !current)}
            />
{contentExpanded && (
                <div style={{ paddingBottom: 12 }}>
                  {sidebarContent.length === 0 ? (
                    <div style={{ padding: "8px 12px", fontSize: 13, color: "#9699a6" }}>
                      No content yet
                    </div>
                  ) : (
                    sidebarContent.map((item) => (
                      <ContentRow
                        key={item.id}
                        item={item}
                        active={activeContentItem === item.id}
                        onClick={() => {
                          setActiveContentItem(item.id);
                          closeMenu();
                        }}
                      />
                    ))
                  )}
                </div>
              )}
          </div>
        </div>
      )}

      {collapsed && (
        <div style={{ padding: 12 }}>
          <IconButton
            icon={ChevronsLeft}
            label="Expand sidebar"
            rotate
            onClick={() => setCollapsed(false)}
          />
        </div>
      )}

      <div style={{ flex: 1, background: "#fafbfc", minWidth: 0 }} />
    </div>
  );
}
