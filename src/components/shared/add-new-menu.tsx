"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Sparkles,
  Heart,
  FileText,
  FolderPlus,
  ChevronRight,
  FileInput,
  Download,
  Settings2,
  MoreHorizontal,
  Star,
  BarChart3,
  Layout,
  RectangleHorizontal,
  Bot,
  Zap,
  Layers,
  Copy,
  FileCog,
} from "lucide-react";

import { useWorkspace } from "@/lib/workspace-context";
import {
  createBoardWithDefaults,
  createBoardFromTemplate,
  createMultiLevelBoard,
  createDashboardBoard,
} from "@/features/boards/engine/actions/create";
import { openImportWizard, exportBoardToExcel } from "@/features/boards/engine/lib/import-export-events";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type CreateTarget = "dashboard" | "board" | "doc" | "folder" | "templates" | "multi-level-board" | "board-from-template" | "vibe-app" | "form";
type AgentVibeTarget = "agent" | "vibe-app";

interface TemplateOption {
  id: string;
  name: string;
  description: string;
}

const boardTemplates: TemplateOption[] = [
  { id: "creative-ops", name: "Creative Operations", description: "Production-heavy service teams" },
  { id: "custom-board", name: "Custom Board", description: "Blank metadata-first board" },
];

function useCreateHandler() {
  const router = useRouter();
  const {
    addDoc,
    createFolder,
    addVibeApp,
    addForm,
    syncBoard,
    activeWorkspaceId,
    activeWorkspace,
    hydrateActiveWorkspaceContent,
    recoverFromStaleWorkspace,
    workspaces,
  } = useWorkspace();
  const creatingRef = useRef(false);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const activeWorkspaceRef = useRef(activeWorkspace);
  const workspacesRef = useRef(workspaces);
  activeWorkspaceIdRef.current = activeWorkspaceId;
  activeWorkspaceRef.current = activeWorkspace;
  workspacesRef.current = workspaces;

  const create = async (target: CreateTarget, name?: string, templateId?: string, extra?: { boardId?: string }) => {
    if (creatingRef.current) return;
    if (target === "dashboard" || target === "board" || target === "multi-level-board" || target === "board-from-template") {
      if (!activeWorkspaceIdRef.current || !activeWorkspaceRef.current?.organizationId) {
        const msg = `Cannot create ${target}: no active workspace selected`;
        console.error(msg);
        await recoverFromStaleWorkspace();
        if (!activeWorkspaceIdRef.current || !activeWorkspaceRef.current?.organizationId) {
          throw new Error(msg);
        }
      }
      const workspaceExists = workspacesRef.current.some((w) => w.id === activeWorkspaceIdRef.current);
      if (!workspaceExists) {
        const msg = `Workspace "${activeWorkspaceIdRef.current}" not found. It may have been deleted.`;
        console.error(msg);
        toast.error(msg);
        await recoverFromStaleWorkspace();
        throw new Error(msg);
      }
    }

    creatingRef.current = true;
    let created = false;
    try {
      if (target === "dashboard") {
        const result = await createDashboardBoard(
          name || "New Dashboard",
          activeWorkspaceIdRef.current!,
          activeWorkspaceRef.current!.organizationId,
        );
        syncBoard({ id: result.board.id, name: result.board.name, slug: result.board.slug, favorite: result.board.favorite, pinned: result.board.pinned });
        router.push(`/${result.board.slug}`);
        created = true;
      } else if (target === "board") {
        const debugPayload = {
          target,
          name: name || "New Board",
          workspaceId: activeWorkspaceIdRef.current,
          organizationId: activeWorkspaceRef.current?.organizationId,
          workspaces: workspacesRef.current.map((w) => w.id),
        };
        console.warn("[add-new-menu] createBoardWithDefaults payload", debugPayload);
        const result = await createBoardWithDefaults(
          name || "New Board",
          activeWorkspaceIdRef.current!,
          activeWorkspaceRef.current!.organizationId,
        );
        syncBoard({ id: result.board.id, name: result.board.name, slug: result.board.slug, favorite: result.board.favorite, pinned: result.board.pinned });
        router.push(`/${result.board.slug}`);
        created = true;
      } else if (target === "multi-level-board") {
        const result = await createMultiLevelBoard(
          name || "New Multi-Level Board",
          activeWorkspaceIdRef.current!,
          activeWorkspaceRef.current!.organizationId,
        );
        syncBoard({ id: result.board.id, name: result.board.name, slug: result.board.slug, favorite: result.board.favorite, pinned: result.board.pinned });
        router.push(`/${result.board.slug}`);
        created = true;
      } else if (target === "board-from-template") {
        if (!templateId) throw new Error("Template ID required");
        const result = await createBoardFromTemplate(
          name || "New Board from Template",
          activeWorkspaceIdRef.current!,
          activeWorkspaceRef.current!.organizationId,
          templateId,
        );
        syncBoard({ id: result.board.id, name: result.board.name, slug: result.board.slug, favorite: result.board.favorite, pinned: result.board.pinned });
        router.push(`/${result.board.slug}`);
        created = true;
      } else if (target === "folder") {
        const folder = createFolder(name || "New Folder");
        router.push(`/folder/${folder.id}`);
        created = true;
      } else if (target === "doc") {
        const doc = addDoc(name || "New Doc");
        router.push(`/doc/${doc.id}`);
        created = true;
      } else if (target === "templates") {
        router.push("/templates");
        created = true;
      } else if (target === "vibe-app") {
        const vibeApp = addVibeApp(name || "New Vibe app", "");
        router.push(`/${vibeApp.id}`);
        created = true;
      } else if (target === "form") {
        const boardId = extra?.boardId || activeWorkspaceIdRef.current;
        const form = addForm(name || "New Form", boardId);
        router.push(`/form/${form.id}`);
        created = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create board.";
      console.error(`Failed to create ${target}:`, error);
      toast.error(message);
      throw error;
    } finally {
      creatingRef.current = false;
      if (!created && (target === "board" || target === "dashboard" || target === "multi-level-board" || target === "board-from-template" || target === "folder" || target === "doc" || target === "vibe-app" || target === "form")) {
        await hydrateActiveWorkspaceContent();
      }
    }
  };

  return create;
}

function useAgentVibeHandler() {
  const router = useRouter();
  const { activeWorkspaceId, activeWorkspace, workspaces, recoverFromStaleWorkspace } = useWorkspace();
  const creatingRef = useRef(false);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const activeWorkspaceRef = useRef(activeWorkspace);
  const workspacesRef = useRef(workspaces);
  activeWorkspaceIdRef.current = activeWorkspaceId;
  activeWorkspaceRef.current = activeWorkspace;
  workspacesRef.current = workspaces;

  const create = async (target: AgentVibeTarget, name?: string) => {
    if (creatingRef.current) return;
    if (!activeWorkspaceIdRef.current || !activeWorkspaceRef.current?.organizationId) {
      const msg = `Cannot create ${target}: no active workspace selected`;
      console.error(msg);
      await recoverFromStaleWorkspace();
      if (!activeWorkspaceIdRef.current || !activeWorkspaceRef.current?.organizationId) {
        throw new Error(msg);
      }
    }
    const workspaceExists = workspacesRef.current.some((w) => w.id === activeWorkspaceIdRef.current);
    if (!workspaceExists) {
      const msg = `Workspace "${activeWorkspaceIdRef.current}" not found. It may have been deleted.`;
      console.error(msg);
      toast.error(msg);
      await recoverFromStaleWorkspace();
      throw new Error(msg);
    }

    creatingRef.current = true;
    try {
      if (target === "agent") {
        router.push("/agents/new");
      } else if (target === "vibe-app") {
        router.push("/vibe/new");
      }
    } catch (error) {
      console.error(`Failed to navigate to ${target} creation:`, error);
      throw error;
    } finally {
      creatingRef.current = false;
    }
  };

  return create;
}

export function AddNewMenu() {
  const [open, setOpen] = useState(false);
  const [boardSubOpen, setBoardSubOpen] = useState(false);
  const [docSubOpen, setDocSubOpen] = useState(false);
  const [moreSubOpen, setMoreSubOpen] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [nameDialogTarget, setNameDialogTarget] = useState<CreateTarget | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("creative-ops");
  const [showInstalledApps, setShowInstalledApps] = useState(false);
  const [showFormBoardPicker, setShowFormBoardPicker] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const { hasHydrated, activeWorkspaceId, activeWorkspace, recoverFromStaleWorkspace } = useWorkspace();
  const create = useCreateHandler();
  const createAgentVibe = useAgentVibeHandler();
  const { createWorkspace } = useWorkspace();

  const handleBoardHover = () => {
    setBoardSubOpen(true);
    setDocSubOpen(false);
    setMoreSubOpen(false);
  };

  const handleDocHover = () => {
    setDocSubOpen(true);
    setBoardSubOpen(false);
    setMoreSubOpen(false);
  };

  const handleMoreHover = () => {
    setMoreSubOpen(true);
    setBoardSubOpen(false);
    setDocSubOpen(false);
  };

  const handleMouseLeave = () => {
    setBoardSubOpen(false);
    setDocSubOpen(false);
    setMoreSubOpen(false);
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    console.log(`[add-new-menu] handleCreateWorkspace started for: "${newWorkspaceName.trim()}"`);
    setIsCreatingWorkspace(true);
    try {
      await Promise.race([
        createWorkspace(newWorkspaceName.trim()),
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("Workspace creation timed out after 30000ms")), 30000);
        }),
      ]);
      console.log(`[add-new-menu] handleCreateWorkspace succeeded`);
      setNewWorkspaceName("");
      setShowCreateWorkspace(false);
      toast.success("Workspace created successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create workspace.";
      console.error(`[add-new-menu] handleCreateWorkspace failed:`, err);
      toast.error(message);
    } finally {
      setIsCreatingWorkspace(false);
      setShowCreateWorkspace(false);
    }
  };

  const handleCreateFromDialog = async () => {
    if (!newItemName.trim() || !nameDialogTarget || isCreatingItem) return;
    if ((nameDialogTarget === "dashboard" || nameDialogTarget === "board" || nameDialogTarget === "multi-level-board" || nameDialogTarget === "board-from-template") && (!activeWorkspaceId || !activeWorkspace?.organizationId)) {
      toast.error("Please select a workspace first.");
      return;
    }
    console.log(`[add-new-menu] handleCreateFromDialog started: ${nameDialogTarget}/${newItemName.trim()}`);
    setIsCreatingItem(true);
    try {
      if (nameDialogTarget === "board-from-template") {
        await Promise.race([
          create(nameDialogTarget, newItemName.trim(), selectedTemplate),
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error("Board creation timed out after 30000ms")), 30000);
          }),
        ]);
        toast.success("Board created from template successfully.");
      } else {
        await Promise.race([
          create(nameDialogTarget, newItemName.trim()),
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error("Board creation timed out after 30000ms")), 30000);
          }),
        ]);
        const label = nameDialogTarget === "dashboard" ? "Dashboard" : nameDialogTarget === "multi-level-board" ? "Multi-level board" : "Board";
        toast.success(`${label} created successfully.`);
      }
      console.log(`[add-new-menu] handleCreateFromDialog succeeded`);
      setShowNameDialog(false);
      setNewItemName("");
      setNameDialogTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to create ${nameDialogTarget}.`;
      console.error(`[add-new-menu] handleCreateFromDialog failed:`, error);
      if (message.includes("Workspace not found") || message.includes("Organization not found")) {
        toast.error("The selected workspace or organization no longer exists. Refreshing workspace list...");
        await recoverFromStaleWorkspace();
      } else {
        toast.error(message);
      }
    } finally {
      setIsCreatingItem(false);
    }
  };

  const handleAgentVibeCreate = async (target: AgentVibeTarget) => {
    setOpen(false);
    try {
      await createAgentVibe(target);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to create ${target}.`;
      if (message.includes("Workspace not found") || message.includes("Organization not found")) {
        toast.error("The selected workspace or organization no longer exists. Refreshing workspace list...");
        await recoverFromStaleWorkspace();
      } else {
        toast.error(message);
      }
    }
  };

  const handleInstalledApps = () => {
    setOpen(false);
    setShowInstalledApps(true);
  };

  const handleFormClick = () => {
    setOpen(false);
    setShowFormBoardPicker(true);
  };

  const handleCreateForm = async () => {
    if (!selectedBoardId) {
      toast.error("Please select a board.");
      return;
    }
    setShowFormBoardPicker(false);
    try {
      await create("form", "New Form", undefined, { boardId: selectedBoardId });
      toast.success("Form created successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create form.";
      toast.error(message);
    }
  };

  const isWorkspaceReady = activeWorkspaceId && activeWorkspace?.organizationId && hasHydrated;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-accent"
            aria-label="Add new"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="bottom"
          sideOffset={4}
          className="w-56 p-1"
          onMouseLeave={handleMouseLeave}
        >
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Add new</div>

          <DropdownMenuItem
            onSelect={() => handleAgentVibeCreate("agent")}
            disabled={!isWorkspaceReady}
            className="gap-2 rounded-md py-2"
          >
            <Bot className="size-4 text-gray-700" aria-hidden="true" />
            <span>Agent</span>
            {!isWorkspaceReady && <Settings2 className="ml-auto size-3.5 text-gray-400" aria-hidden="true" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => handleAgentVibeCreate("vibe-app")}
            disabled={!isWorkspaceReady}
            className="gap-2 rounded-md py-2"
          >
            <Zap className="size-4 text-gray-700" aria-hidden="true" />
            <span>Vibe app</span>
            {!isWorkspaceReady && <Settings2 className="ml-auto size-3.5 text-gray-400" aria-hidden="true" />}
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1" />

          <div onMouseEnter={handleBoardHover} onMouseLeave={handleMouseLeave}>
            <DropdownMenuSub open={boardSubOpen} onOpenChange={setBoardSubOpen}>
              <DropdownMenuSubTrigger
                className="gap-2 rounded-md py-2"
                disabled={!isWorkspaceReady}
              >
                <RectangleHorizontal className="size-4 text-gray-700" aria-hidden="true" />
                <span>Board</span>
                <ChevronRight className="ml-auto size-3.5 text-gray-500" aria-hidden="true" />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                alignOffset={-8}
                sideOffset={-4}
                className="w-56 p-1"
              >
                <DropdownMenuItem
                  onSelect={() => { setNameDialogTarget("board"); setShowNameDialog(true); }}
                  disabled={!isWorkspaceReady}
                  className="gap-2 rounded-md py-2 bg-accent/50"
                >
                  <RectangleHorizontal className="size-4 text-gray-700" aria-hidden="true" />
                  <span>New Board</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => { setNameDialogTarget("multi-level-board"); setShowNameDialog(true); }}
                  disabled={!isWorkspaceReady}
                  className="gap-2 rounded-md py-2"
                >
                  <Layers className="size-4 text-gray-700" aria-hidden="true" />
                  <span>New multi-level board</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => { setNameDialogTarget("board-from-template"); setShowNameDialog(true); }}
                  disabled={!isWorkspaceReady}
                  className="gap-2 rounded-md py-2"
                >
                  <Copy className="size-4 text-gray-700" aria-hidden="true" />
                  <span>Start with template</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </div>

          <div onMouseEnter={handleDocHover} onMouseLeave={handleMouseLeave}>
            <DropdownMenuSub open={docSubOpen} onOpenChange={setDocSubOpen}>
              <DropdownMenuSubTrigger
                className="gap-2 rounded-md py-2"
                disabled={!isWorkspaceReady}
              >
                <FileText className="size-4 text-gray-700" aria-hidden="true" />
                <span>Doc</span>
                <ChevronRight className="ml-auto size-3.5 text-gray-500" aria-hidden="true" />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                alignOffset={-8}
                sideOffset={-4}
                className="w-56 p-1"
              >
                <DropdownMenuItem
                  onSelect={() => create("doc")}
                  disabled={!isWorkspaceReady}
                  className="gap-2 rounded-md py-2"
                >
                  <FileText className="size-4 text-gray-700" aria-hidden="true" />
                  <span>New Doc</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </div>

          <DropdownMenuItem
            onSelect={() => { setNameDialogTarget("dashboard"); setShowNameDialog(true); }}
            disabled={!isWorkspaceReady}
            className="gap-2 rounded-md py-2"
          >
            <BarChart3 className="size-4 text-gray-700" aria-hidden="true" />
            <span>Dashboard</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1" />

          <DropdownMenuItem
            onSelect={() => create("folder")}
            disabled={!isWorkspaceReady}
            className="gap-2 rounded-md py-2"
          >
            <FolderPlus className="size-4 text-gray-700" aria-hidden="true" />
            <span>Folder</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => create("templates")}
            className="gap-2 rounded-md py-2"
          >
            <Star className="size-4 text-gray-700" aria-hidden="true" />
            <span>Template center</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1" />

          <div onMouseEnter={handleMoreHover} onMouseLeave={handleMouseLeave}>
            <DropdownMenuSub open={moreSubOpen} onOpenChange={setMoreSubOpen}>
              <DropdownMenuSubTrigger className="gap-2 rounded-md py-2">
                <MoreHorizontal className="size-4 text-gray-700" aria-hidden="true" />
                <span>More</span>
                <ChevronRight className="ml-auto size-3.5 text-gray-500" aria-hidden="true" />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                alignOffset={-8}
                sideOffset={-4}
                className="w-56 p-1"
              >
                <DropdownMenuItem
                  onSelect={openImportWizard}
                  className="gap-2 rounded-md py-2"
                >
                  <FileInput className="size-4 text-gray-700" aria-hidden="true" />
                  <span>Import data</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={exportBoardToExcel}
                  className="gap-2 rounded-md py-2"
                >
                  <Download className="size-4 text-gray-700" aria-hidden="true" />
                  <span>Export data</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 rounded-md py-2"
                  onClick={handleInstalledApps}
                >
                  <Layout className="size-4 text-gray-700" aria-hidden="true" />
                  <span>Installed apps</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 rounded-md py-2"
                  onClick={handleFormClick}
                >
                  <FileCog className="size-4 text-gray-700" aria-hidden="true" />
                  <span>Form</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {showCreateWorkspace && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg popover-surface p-4">
            <h3 className="text-sm font-semibold">Create new workspace</h3>
            <input
              autoFocus
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateWorkspace()}
              placeholder="Workspace name"
              className="mt-2 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => { setShowCreateWorkspace(false); setNewWorkspaceName(""); setIsCreatingWorkspace(false); }}
                className="rounded-md px-3 py-1.5 text-xs hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWorkspace}
                disabled={!newWorkspaceName.trim() || isCreatingWorkspace}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
              >
                {isCreatingWorkspace ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNameDialog && (
        <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {nameDialogTarget === "dashboard" ? "Name your dashboard" :
                 nameDialogTarget === "multi-level-board" ? "Name your multi-level board" :
                 nameDialogTarget === "board-from-template" ? "Name your board from template" :
                 "Name your board"}
              </DialogTitle>
              <DialogDescription>
                Give your {nameDialogTarget === "dashboard" ? "dashboard" : nameDialogTarget === "multi-level-board" ? "multi-level board" : nameDialogTarget === "board-from-template" ? "board from template" : "board"} a name to get started.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 mt-2">
              <Input
                autoFocus
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newItemName.trim() && !isCreatingItem) {
                    handleCreateFromDialog();
                  }
                }}
                placeholder={
                  nameDialogTarget === "dashboard" ? "Dashboard name" :
                  nameDialogTarget === "multi-level-board" ? "Multi-level board name" :
                  nameDialogTarget === "board-from-template" ? "Board name" :
                  "Board name"
                }
              />
              {nameDialogTarget === "board-from-template" && (
                <div className="space-y-1">
                  <label htmlFor="template-select" className="block text-xs font-medium">Template</label>
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger id="template-select" className="w-full">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {boardTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          <div>
                            <p className="font-medium">{template.name}</p>
                            <p className="text-xs text-muted-foreground">{template.description}</p>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <button
                onClick={() => {
                  setShowNameDialog(false);
                  setNewItemName("");
                  setNameDialogTarget(null);
                }}
                className="rounded-md px-3 py-1.5 text-xs hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFromDialog}
                disabled={
                  !newItemName.trim() ||
                  isCreatingItem ||
                  !hasHydrated ||
                  ((nameDialogTarget === "board" || nameDialogTarget === "dashboard" || nameDialogTarget === "multi-level-board" || nameDialogTarget === "board-from-template") && (!activeWorkspaceId || !activeWorkspace?.organizationId))
                }
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
              >
                {isCreatingItem ? "Creating..." : "Create"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showInstalledApps && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg popover-surface p-4">
            <h3 className="text-sm font-semibold">Installed apps</h3>
            <p className="mt-1 text-xs text-muted-foreground">Apps currently installed in this workspace.</p>
            <ul className="mt-3 space-y-1.5">
              {[
                { name: "Board Engine", version: "1.2.0", description: "Core board functionality" },
                { name: "Import / Export", version: "0.9.0", description: "CSV and Excel support" },
                { name: "Dashboard Widgets", version: "1.0.0", description: "KPI and chart widgets" },
              ].map((app) => (
                <li key={app.name} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{app.name}</p>
                    <p className="text-xs text-muted-foreground">{app.description}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{app.version}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowInstalledApps(false)}
                className="rounded-md px-3 py-1.5 text-xs hover:bg-accent"
              >
                Close
              </button>
              <button
                onClick={() => { setShowInstalledApps(false); toast.success("Opening app store..."); }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
              >
                Browse more apps
              </button>
            </div>
          </div>
        </div>
      )}

      {showFormBoardPicker && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg popover-surface p-4">
            <h3 className="text-sm font-semibold">Create new form</h3>
            <p className="mt-1 text-xs text-muted-foreground">Select the board this form should be linked to.</p>
            <div className="mt-3 space-y-1.5">
              {(activeWorkspace?.content ?? []).filter((item) => item.type === "board").length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No boards found. Create a board first.</p>
              ) : (
                (activeWorkspace?.content ?? [])
                  .filter((item) => item.type === "board")
                  .map((board) => (
                    <button
                      key={board.id}
                      onClick={() => setSelectedBoardId(board.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors",
                        selectedBoardId === board.id
                          ? "bg-primary/10 border border-primary"
                          : "border hover:bg-accent",
                      )}
                    >
                      <span className="flex-1 truncate">{board.name}</span>
                      {selectedBoardId === board.id && (
                        <span className="text-xs text-primary">Selected</span>
                      )}
                    </button>
                  ))
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setShowFormBoardPicker(false); setSelectedBoardId(""); }}
                className="rounded-md px-3 py-1.5 text-xs hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateForm}
                disabled={!selectedBoardId}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
              >
                Create form
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}