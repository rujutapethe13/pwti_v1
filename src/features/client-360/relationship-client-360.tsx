"use client";

import * as React from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Mail,
  Phone,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  Edit2,
  ExternalLink,
  Shield,
  Filter,
  Search,
  FileText,
  CreditCard,
  Headphones,
  Users,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  Building2,
  Globe,
  Briefcase,
  AlertCircle,
  HelpCircle,
  Lock,
  Tag,
  ArrowRight,
  Send,
  Eye,
  EyeOff,
  UserCheck,
  Share2,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type {
  Client360Profile,
  LifecycleStage,
  UserViewRole,
  TimelineActivity,
  NextBestAction,
  KeyContact,
  DealProject,
  ClientNote,
} from "./relationship-types";
import { MOCK_CLIENTS } from "./relationship-mock-data";
import { AutomationCenterModal } from "@/features/automations/automation-center-modal";
import { calculateDueDate } from "@/features/automations/payment-overdue-service";

export interface RelationshipClient360Props {
  initialClientId?: string;
  onSwitchToStudioOrders?: () => void;
}

export function RelationshipClient360({
  initialClientId = "safari",
  onSwitchToStudioOrders,
}: RelationshipClient360Props) {
  // Client selection
  const [selectedClientId, setSelectedClientId] = React.useState<string>(
    initialClientId in MOCK_CLIENTS ? initialClientId : "safari"
  );
  const [clientData, setClientData] = React.useState<Client360Profile>(
    MOCK_CLIENTS[selectedClientId] ?? MOCK_CLIENTS["safari"]
  );

  // Sync clientData when initialClientId or selectedClientId changes
  React.useEffect(() => {
    if (initialClientId && initialClientId in MOCK_CLIENTS) {
      setSelectedClientId(initialClientId);
    }
  }, [initialClientId]);

  React.useEffect(() => {
    if (MOCK_CLIENTS[selectedClientId]) {
      setClientData(MOCK_CLIENTS[selectedClientId]);
    }
  }, [selectedClientId]);

  // Role permissions
  const [currentRole, setCurrentRole] = React.useState<UserViewRole>("Admin");
  const canEdit = currentRole !== "Viewer";
  const canViewFinance = currentRole === "Admin" || currentRole === "Finance" || currentRole === "Sales";
  const canViewConfidentialNotes = currentRole === "Admin" || currentRole === "Sales";

  // Tabs
  const [activeTab, setActiveTab] = React.useState<
    | "overview"
    | "activity"
    | "deals"
    | "billing"
    | "support"
    | "documents"
    | "contacts"
    | "notes"
  >("overview");

  // Activity timeline filtering & search
  const [timelineFilter, setTimelineFilter] = React.useState<string>("all");
  const [timelineRoleView, setTimelineRoleView] = React.useState<"all" | "sales" | "support" | "finance">("all");
  const [timelineSearch, setTimelineSearch] = React.useState("");
  const [chartMetric, setChartMetric] = React.useState<"jobs" | "skus" | "revenue">("jobs");

  // Modals for Quick Actions
  const [emailModalOpen, setEmailModalOpen] = React.useState(false);
  const [callModalOpen, setCallModalOpen] = React.useState(false);
  const [taskModalOpen, setTaskModalOpen] = React.useState(false);
  const [noteModalOpen, setNoteModalOpen] = React.useState(false);
  const [automationsModalOpen, setAutomationsModalOpen] = React.useState(false);

  // Overdue payment computation
  const overdueInvoices = React.useMemo(() => {
    return clientData.billing.invoices.filter(
      (inv) => inv.status === "Overdue" || ((inv.daysOverdue ?? 0) > 0 && inv.paymentStatus !== "Paid")
    );
  }, [clientData.billing.invoices]);

  const hasOverduePayment = overdueInvoices.length > 0;
  const overdueTotalAmount = overdueInvoices.reduce((acc, inv) => acc + inv.amount, 0);

  // Recalculate payment due dates dynamically if payment terms change
  const handlePaymentTermsChange = (
    newTerms: "Immediate" | "15 days" | "30 days" | "45 days" | "Custom",
    customDays?: number
  ) => {
    setClientData((prev) => {
      const updatedInvoices = prev.billing.invoices.map((inv) => {
        const booked = inv.jobBookedDate || inv.issueDate;
        const newDueDate = calculateDueDate(booked, newTerms, customDays);
        const today = new Date();
        const dueD = new Date(newDueDate);
        const isPast = dueD.getTime() < today.getTime();
        const isStillOverdue = isPast && inv.paymentStatus !== "Paid";
        const diffMs = today.getTime() - dueD.getTime();
        const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

        return {
          ...inv,
          dueDate: newDueDate,
          paymentDueDate: newDueDate,
          paymentTerms: newTerms,
          status: isStillOverdue
            ? ("Overdue" as const)
            : inv.status === "Overdue"
              ? ("Pending" as const)
              : inv.status,
          daysOverdue: isStillOverdue ? days : 0,
        };
      });

      return {
        ...prev,
        billing: {
          ...prev.billing,
          paymentTerms: newTerms,
          customPaymentDays: customDays,
          invoices: updatedInvoices,
        },
      };
    });
    toast.success(`Updated payment terms to "${newTerms}". Recalculated due dates.`);
  };

  // Mark invoice as Paid
  const handleMarkInvoicePaid = (invId: string) => {
    setClientData((prev) => {
      const targetInv = prev.billing.invoices.find((i) => i.id === invId);
      const updatedInvoices = prev.billing.invoices.map((inv) =>
        inv.id === invId
          ? {
              ...inv,
              status: "Paid" as const,
              paymentStatus: "Paid" as const,
              paidAmount: inv.amount,
              daysOverdue: 0,
            }
          : inv
      );
      const updatedNba = prev.nextBestActions.map((nba) =>
        nba.category === "Billing" ? { ...nba, completed: true } : nba
      );
      const activity: TimelineActivity = {
        id: `act-paid-${Date.now()}`,
        type: "payment",
        title: `Payment Received: Invoice #${targetInv?.invoiceNumber || invId}`,
        summary: `Marked as Paid in full ($${targetInv?.amount.toLocaleString() || "0"}). Overdue alert resolved.`,
        author: "Rujuta Pethe",
        authorRole: "Studio Lead",
        timestamp: new Date().toISOString().slice(0, 16).replace("T", " "),
      };

      return {
        ...prev,
        billing: {
          ...prev.billing,
          invoices: updatedInvoices,
        },
        nextBestActions: updatedNba,
        timeline: [activity, ...prev.timeline],
      };
    });
    toast.success("Invoice marked as Paid! Overdue alert resolved and logged to activity feed.");
  };

  // Quick Action Form state
  const [emailForm, setEmailForm] = React.useState({
    to: "",
    subject: "",
    body: "",
  });
  const [callForm, setCallForm] = React.useState({
    contact: "",
    duration: "15 mins",
    outcome: "Follow-up required",
    notes: "",
  });
  const [taskForm, setTaskForm] = React.useState({
    title: "",
    assignee: "Rujuta Pethe",
    dueDate: "",
    priority: "high" as const,
  });
  const [noteForm, setNoteForm] = React.useState({
    title: "",
    content: "",
    isConfidential: false,
    isPinned: false,
  });

  // Mobile sidebar toggle
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);

  // Live update simulation
  const [lastSyncTime, setLastSyncTime] = React.useState<string>("just now");
  const [isSyncing, setIsSyncing] = React.useState(false);

  // Handlers for inline edits
  const handleStageChange = (newStage: LifecycleStage) => {
    if (!canEdit) {
      toast.error("You have view-only access and cannot change lifecycle stages.");
      return;
    }
    setClientData((prev) => ({
      ...prev,
      lifecycleStage: newStage,
    }));
    toast.success(`Lifecycle stage updated to ${newStage}`);
  };

  const handleNextActionClick = (action: NextBestAction) => {
    if (action.actionType === "email") {
      setEmailForm({
        to: clientData.keyContacts[0]?.email ?? "",
        subject: `Regarding: ${action.title}`,
        body: `Hi ${clientData.keyContacts[0]?.name?.split(" ")[0] ?? "there"},\n\nI am reaching out regarding ${action.title.toLowerCase()}.\n\nBest regards,\n${clientData.accountOwner.name}`,
      });
      setEmailModalOpen(true);
    } else if (action.actionType === "call") {
      setCallForm((prev) => ({
        ...prev,
        contact: clientData.keyContacts[0]?.name ?? "",
        notes: `Discussing: ${action.title}`,
      }));
      setCallModalOpen(true);
    } else if (action.actionType === "invoice") {
      toast.success(`Payment reminder successfully dispatched for ${action.title}`);
      setClientData((prev) => ({
        ...prev,
        nextBestActions: prev.nextBestActions.map((a) =>
          a.id === action.id ? { ...a, completed: true } : a,
        ),
      }));
    } else {
      toast.info(`Triggered action: ${action.actionLabel}`);
      setClientData((prev) => ({
        ...prev,
        nextBestActions: prev.nextBestActions.map((a) =>
          a.id === action.id ? { ...a, completed: true } : a,
        ),
      }));
    }
  };

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.subject.trim()) {
      toast.error("Please enter a subject.");
      return;
    }
    const newActivity: TimelineActivity = {
      id: `act-${Date.now()}`,
      type: "email",
      title: `Sent Email: "${emailForm.subject}"`,
      summary: `Delivered to ${emailForm.to || clientData.keyContacts[0]?.email}`,
      details: emailForm.body,
      author: clientData.accountOwner.name,
      authorRole: clientData.accountOwner.role,
      timestamp: new Date().toISOString().slice(0, 16).replace("T", " "),
    };
    setClientData((prev) => ({
      ...prev,
      timeline: [newActivity, ...prev.timeline],
    }));
    setEmailModalOpen(false);
    toast.success(`Email sent to ${emailForm.to || clientData.keyContacts[0]?.email}`);
  };

  const handleLogCall = (e: React.FormEvent) => {
    e.preventDefault();
    const newActivity: TimelineActivity = {
      id: `act-${Date.now()}`,
      type: "call",
      title: `Logged Call with ${callForm.contact || clientData.keyContacts[0]?.name}`,
      summary: `Outcome: ${callForm.outcome} (${callForm.duration})`,
      details: callForm.notes || "Call logged without extra notes.",
      author: clientData.accountOwner.name,
      authorRole: clientData.accountOwner.role,
      timestamp: new Date().toISOString().slice(0, 16).replace("T", " "),
    };
    setClientData((prev) => ({
      ...prev,
      timeline: [newActivity, ...prev.timeline],
      kpis: {
        ...prev.kpis,
        lastContactDate: "Today",
      },
    }));
    setCallModalOpen(false);
    toast.success("Call logged to timeline");
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.title.trim()) {
      toast.error("Please enter a task title.");
      return;
    }
    const newAction: NextBestAction = {
      id: `nba-custom-${Date.now()}`,
      priority: taskForm.priority,
      category: "Engagement",
      title: taskForm.title,
      reason: `Assigned to ${taskForm.assignee}${taskForm.dueDate ? ` (Due ${taskForm.dueDate})` : ""}`,
      impact: "Team follow-up action item.",
      dueDate: taskForm.dueDate || "Next few days",
      actionLabel: "Complete Task",
      actionType: "task",
    };
    setClientData((prev) => ({
      ...prev,
      nextBestActions: [newAction, ...prev.nextBestActions],
    }));
    setTaskModalOpen(false);
    setTaskForm({ title: "", assignee: "Rujuta Pethe", dueDate: "", priority: "high" });
    toast.success("Task added to Next Best Actions");
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteForm.content.trim()) {
      toast.error("Please enter note content.");
      return;
    }
    const newNote: ClientNote = {
      id: `note-${Date.now()}`,
      title: noteForm.title.trim() || "Account Note",
      content: noteForm.content,
      author: clientData.accountOwner.name,
      authorRole: clientData.accountOwner.role,
      createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      isPinned: noteForm.isPinned,
      isConfidential: noteForm.isConfidential,
      tags: ["Direct Note"],
    };
    setClientData((prev) => ({
      ...prev,
      notes: [newNote, ...prev.notes],
      timeline: [
        {
          id: `act-note-${Date.now()}`,
          type: "note",
          title: `Added Note: ${newNote.title}`,
          summary: newNote.content.slice(0, 80) + (newNote.content.length > 80 ? "..." : ""),
          author: clientData.accountOwner.name,
          timestamp: new Date().toISOString().slice(0, 16).replace("T", " "),
        },
        ...prev.timeline,
      ],
    }));
    setNoteModalOpen(false);
    setNoteForm({ title: "", content: "", isConfidential: false, isPinned: false });
    toast.success("Note saved");
  };

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setLastSyncTime("just now");
      toast.success("All CRM, billing, and support data sources synced.");
    }, 1200);
  };

  // Timeline filtering logic
  const filteredTimeline = React.useMemo(() => {
    return clientData.timeline.filter((act) => {
      // Type filter
      if (timelineFilter !== "all" && act.type !== timelineFilter) {
        return false;
      }
      // Role view preset
      if (timelineRoleView === "sales") {
        if (!["meeting", "call", "deal", "email"].includes(act.type)) return false;
      } else if (timelineRoleView === "support") {
        if (!["ticket", "call", "email"].includes(act.type)) return false;
      } else if (timelineRoleView === "finance") {
        if (!["payment", "usage"].includes(act.type)) return false;
      }
      // Search
      if (timelineSearch.trim()) {
        const q = timelineSearch.toLowerCase();
        const matchesTitle = act.title.toLowerCase().includes(q);
        const matchesSummary = act.summary.toLowerCase().includes(q);
        const matchesAuthor = act.author.toLowerCase().includes(q);
        if (!matchesTitle && !matchesSummary && !matchesAuthor) return false;
      }
      return true;
    });
  }, [clientData.timeline, timelineFilter, timelineRoleView, timelineSearch]);

  // Health score styling
  const healthScore = clientData.health.score;
  const healthColor =
    healthScore >= 80
      ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
      : healthScore >= 50
        ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
        : "text-rose-500 bg-rose-500/10 border-rose-500/20";

  const healthBgBar =
    healthScore >= 80 ? "bg-emerald-500" : healthScore >= 50 ? "bg-amber-500" : "bg-rose-500";

  const stageBadgeColor: Record<LifecycleStage, string> = {
    Active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    "At Risk": "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 animate-pulse",
    Lead: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    Churned: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* ── Top Bar: Switcher, Role Preview, Sync Status ── */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {/* Client Switcher */}
          <span className="text-xs font-medium text-muted-foreground">Client:</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2 font-semibold">
                <span className="size-2 rounded-full bg-primary" />
                {clientData.name}
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center justify-between">
                <span>Studio Clients (Real Board Data)</span>
                <span className="text-[10px] text-muted-foreground">
                  {Array.from(new Map(Object.values(MOCK_CLIENTS).map((c) => [c.id, c])).values()).length} clients
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Array.from(
                new Map(Object.values(MOCK_CLIENTS).map((c) => [c.id, c])).values()
              ).map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => setSelectedClientId(c.id)}
                  className={cn(
                    "flex items-center justify-between py-2 cursor-pointer",
                    selectedClientId === c.id && "bg-muted/50 font-semibold"
                  )}
                >
                  <div className="max-w-[190px]">
                    <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.industry}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] shrink-0 font-bold",
                      c.health.score >= 80
                        ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/5"
                        : c.health.score >= 50
                          ? "text-amber-500 border-amber-500/30 bg-amber-500/5"
                          : "text-rose-500 border-rose-500/30 bg-rose-500/5"
                    )}
                  >
                    {c.health.score}/100
                  </Badge>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Quick link to Studio Production Orders */}
          {onSwitchToStudioOrders && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSwitchToStudioOrders}
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              <Briefcase className="mr-1.5 size-3.5" />
              View Studio Production Orders
            </Button>
          )}
        </div>

        {/* Right side controls: Role preview & live sync */}
        <div className="flex items-center gap-3">
          {/* Role Preview Selector */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/30 px-2 py-1">
            <Shield className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">View as:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 text-xs font-semibold hover:underline">
                  {currentRole}
                  <ChevronDown className="size-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Simulate Role Permissions
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(["Admin", "Sales", "Support", "Finance", "Viewer"] as UserViewRole[]).map((r) => (
                  <DropdownMenuItem
                    key={r}
                    onClick={() => {
                      setCurrentRole(r);
                      toast.info(`Switched view to ${r} role.`);
                    }}
                    className={cn("text-xs", currentRole === r && "font-bold text-primary")}
                  >
                    {r}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Live Sync Indicator */}
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span>Synced {lastSyncTime}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={handleManualSync}
              disabled={isSyncing}
              title="Sync CRM and telemetry now"
            >
              <RefreshCw className={cn("size-3", isSyncing && "animate-spin")} />
            </Button>
          </div>

          {/* Mobile sidebar toggle button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs lg:hidden"
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          >
            <Building2 className="size-3.5" />
            Company Info
          </Button>
        </div>
      </div>

      {/* ── Main Sticky Header: Client Title, Health, Financials, Actions ── */}
      <header className="border-b border-border bg-card px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          {/* Client Identity & Account Owner */}
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground shadow-sm">
              {clientData.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {clientData.name}
                </h1>

                {/* Lifecycle Stage dropdown badge */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
                        stageBadgeColor[clientData.lifecycleStage],
                        canEdit && "hover:opacity-80 cursor-pointer",
                      )}
                      title={canEdit ? "Click to change lifecycle stage" : undefined}
                    >
                      {clientData.lifecycleStage}
                      {canEdit && <ChevronDown className="size-3 opacity-60" />}
                    </button>
                  </DropdownMenuTrigger>
                  {canEdit && (
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel className="text-xs text-muted-foreground">
                        Change Lifecycle Stage
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {(["Active", "At Risk", "Lead", "Churned"] as LifecycleStage[]).map((stage) => (
                        <DropdownMenuItem
                          key={stage}
                          onClick={() => handleStageChange(stage)}
                          className={cn(
                            "text-xs font-medium",
                            clientData.lifecycleStage === stage && "font-bold text-primary",
                          )}
                        >
                          {stage}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  )}
                </DropdownMenu>

                <Badge variant="secondary" className="text-xs font-normal text-muted-foreground">
                  {clientData.industry}
                </Badge>

                {/* Overdue Payment Badge */}
                {hasOverduePayment && (
                  <Badge
                    variant="outline"
                    className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 font-semibold cursor-pointer text-xs animate-pulse flex items-center gap-1"
                    onClick={() => setActiveTab("billing")}
                    title="Click to view overdue invoice in Billing tab"
                  >
                    <AlertTriangle className="size-3" />
                    {overdueInvoices.length} Overdue Payment (
                    {canViewFinance ? `$${overdueTotalAmount.toLocaleString()}` : "Restricted"})
                  </Badge>
                )}

                {/* Payment terms badge */}
                <Badge variant="outline" className="text-xs font-normal text-muted-foreground border-border">
                  Terms: {clientData.billing.paymentTerms || "30 days"}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Globe className="size-3.5" />
                  <a
                    href={`https://${clientData.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline hover:text-foreground"
                  >
                    {clientData.domain}
                  </a>
                </span>
                <span>•</span>
                <span>
                  Owner:{" "}
                  <strong className="font-medium text-foreground">
                    {clientData.accountOwner.name}
                  </strong>{" "}
                  ({clientData.accountOwner.role})
                </span>
                <span>•</span>
                <span>{clientData.hqLocation}</span>
              </div>
            </div>
          </div>

          {/* Financials & Health Metrics Strip */}
          <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4 lg:border-t-0 lg:pt-0">
            {/* Health Score Pill */}
            <div className={cn("flex items-center gap-3 rounded-xl border p-2.5 sm:px-3.5", healthColor)}>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black tabular-nums">{clientData.health.score}</span>
                  <span className="text-xs font-semibold opacity-70">/100</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-medium leading-none">
                  {clientData.health.trend === "up" ? (
                    <TrendingUp className="size-3" />
                  ) : clientData.health.trend === "down" ? (
                    <TrendingDown className="size-3" />
                  ) : (
                    <Minus className="size-3" />
                  )}
                  <span>
                    {clientData.health.change > 0 ? `+${clientData.health.change}` : clientData.health.change}{" "}
                    pts
                  </span>
                </div>
              </div>
              <div className="border-l border-current/20 pl-2.5 text-left">
                <p className="text-[10px] uppercase font-bold tracking-wider opacity-75">Health</p>
                <p className="text-xs font-bold leading-tight">{clientData.health.statusLabel}</p>
              </div>
            </div>

            {/* Studio Production Volume */}
            <div className="rounded-xl border border-border bg-background p-2.5 sm:px-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Studio Volume
              </p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {clientData.kpis.totalJobsCount ?? clientData.dealsAndProjects.length} Jobs
              </p>
              <p className="text-[10px] text-muted-foreground">
                {clientData.kpis.totalSkusCount ? `${clientData.kpis.totalSkusCount} SKUs / Assets` : "Production Boards"}
              </p>
            </div>

            {/* Invoicing Terms & Status */}
            <div className="rounded-xl border border-border bg-background p-2.5 sm:px-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Invoicing Terms
              </p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {clientData.billing.paymentTerms || "Net 15"}
              </p>
              <p
                className={cn(
                  "text-[10px] font-semibold",
                  hasOverduePayment
                    ? "text-rose-500 font-bold"
                    : "text-emerald-500 font-medium"
                )}
              >
                {hasOverduePayment
                  ? `${overdueInvoices.length} Overdue ($${overdueTotalAmount.toLocaleString()})`
                  : "All Invoices Paid"}
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={() => {
                  setEmailForm({
                    to: clientData.keyContacts[0]?.email ?? "",
                    subject: `Update regarding ${clientData.name}`,
                    body: "",
                  });
                  setEmailModalOpen(true);
                }}
              >
                <Mail className="size-3.5 text-primary" />
                <span className="hidden sm:inline">Email</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={() => {
                  setCallForm({
                    contact: clientData.keyContacts[0]?.name ?? "",
                    duration: "15 mins",
                    outcome: "Follow-up required",
                    notes: "",
                  });
                  setCallModalOpen(true);
                }}
              >
                <Phone className="size-3.5 text-primary" />
                <span className="hidden sm:inline">Log call</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={() => setTaskModalOpen(true)}
              >
                <CheckCircle2 className="size-3.5 text-primary" />
                <span className="hidden sm:inline">Add task</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={() => setNoteModalOpen(true)}
              >
                <FileText className="size-3.5 text-primary" />
                <span className="hidden sm:inline">Add note</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 font-semibold"
                onClick={() => setAutomationsModalOpen(true)}
              >
                <Zap className="size-3.5 fill-primary text-primary" />
                <span>Automations</span>
                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold">
                  3
                </span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Next Best Actions (Immediately under header) ── */}
      <section className="border-b border-border bg-muted/20 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 pb-2.5">
          <Sparkles className="size-4 text-amber-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Next Best Actions ({clientData.nextBestActions.filter((a) => !a.completed).length} Pending)
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {clientData.nextBestActions.map((action) => {
            const isCritical = action.priority === "critical";
            const isHigh = action.priority === "high";

            return (
              <Card
                key={action.id}
                className={cn(
                  "border transition-all",
                  action.completed && "opacity-50 bg-muted/40",
                  isCritical && !action.completed && "border-rose-500/40 bg-rose-500/[0.02]",
                  isHigh && !action.completed && "border-amber-500/30 bg-amber-500/[0.02]",
                )}
              >
                <CardContent className="p-3.5 flex flex-col justify-between h-full">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-bold uppercase",
                          isCritical
                            ? "border-rose-500 text-rose-500"
                            : isHigh
                              ? "border-amber-500 text-amber-500"
                              : "border-blue-500 text-blue-500",
                        )}
                      >
                        {action.priority} · {action.category}
                      </Badge>
                      {action.dueDate && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="size-3" />
                          {action.dueDate}
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-semibold leading-tight text-foreground">
                      {action.title}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {action.reason}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground italic truncate max-w-[160px]">
                      {action.impact}
                    </span>
                    <Button
                      size="sm"
                      variant={isCritical ? "default" : "outline"}
                      className={cn(
                        "h-7 text-xs font-semibold",
                        isCritical && "bg-rose-600 hover:bg-rose-700 text-white",
                      )}
                      disabled={action.completed}
                      onClick={() => handleNextActionClick(action)}
                    >
                      {action.completed ? (
                        <>
                          <Check className="mr-1 size-3" /> Completed
                        </>
                      ) : (
                        action.actionLabel
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── KPI Strip: Real Studio Production & Invoicing Metrics ── */}
      <section className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border bg-card sm:grid-cols-3 lg:grid-cols-5">
        {/* 1. Total Jobs Logged */}
        <div className="p-4 sm:px-6">
          <p className="text-xs font-medium text-muted-foreground">Total Production Jobs</p>
          <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {clientData.kpis.totalJobsCount ?? 185}
            <span className="ml-1 text-xs font-normal text-muted-foreground">jobs</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Across Jan, Feb, Oct &amp; studio boards</p>
        </div>

        {/* 2. Active Studio Batches */}
        <div className="p-4 sm:px-6">
          <p className="text-xs font-medium text-muted-foreground">Active Studio Batches</p>
          <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {clientData.kpis.activeBatchesCount ?? clientData.dealsAndProjects.filter((d) => d.stage !== "Completed").length}
            <span className="ml-1.5 text-xs font-normal text-amber-500 font-medium">In delivery</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {clientData.dealsAndProjects[0]?.name?.split("—")[0]?.trim() ?? "Current active batches"}
          </p>
        </div>

        {/* 3. Average Turnaround (TAT) */}
        <div className="p-4 sm:px-6">
          <p className="text-xs font-medium text-muted-foreground">Avg Turnaround (TAT)</p>
          <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {clientData.kpis.avgTatDays ?? 2.8}d
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Receive Date to Date of Upload</p>
        </div>

        {/* 4. Total Catalog SKUs / Assets */}
        <div className="p-4 sm:px-6">
          <p className="text-xs font-medium text-muted-foreground">Catalog SKUs / Assets</p>
          <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {clientData.kpis.totalSkusCount ?? 77}
            <span className="ml-1 text-xs font-normal text-muted-foreground">SKUs</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">High-res catalog deliverables</p>
        </div>

        {/* 5. Invoicing & Billing Status */}
        <div className="p-4 sm:px-6">
          <p className="text-xs font-medium text-muted-foreground">Invoiced / Billing Status</p>
          <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {canViewFinance
              ? hasOverduePayment
                ? `${overdueTotalAmount.toLocaleString()}`
                : clientData.billing.invoices.length > 0
                  ? `${clientData.billing.invoices.reduce((acc, curr) => acc + (curr.paidAmount ?? curr.amount), 0).toLocaleString()}`
                  : "—"
              : "[Protected]"}
            {hasOverduePayment && (
              <span className="ml-2 inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-500">
                Overdue
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {clientData.billing.invoices.length > 0
              ? `Terms: ${clientData.billing.paymentTerms || "15 days"}`
              : "Invoice amounts not added yet"}
          </p>
        </div>
      </section>

      {/* ── Main Two-Column Layout: Tabs Content + Collapsible Right Sidebar ── */}
      <div className="flex flex-col lg:flex-row">
        {/* Left / Center: Navigation Tabs & Tab Panels */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {/* Scrollable Tabs Bar */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border pb-px scrollbar-none">
            {[
              { id: "overview", label: "Overview", icon: Building2 },
              { id: "activity", label: "Activity", icon: Clock },
              { id: "deals", label: "Deals & Projects", icon: Briefcase },
              { id: "billing", label: "Billing", icon: CreditCard },
              { id: "support", label: "Support", icon: Headphones },
              { id: "documents", label: "Documents", icon: FileText },
              { id: "contacts", label: "Contacts", icon: Users },
              { id: "notes", label: "Notes", icon: Edit2 },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {tab.label}
                  {tab.id === "support" && clientData.kpis.openTicketsCount > 0 && (
                    <span className="rounded-full bg-rose-500/10 px-1.5 py-0.2 text-[10px] font-bold text-rose-500">
                      {clientData.kpis.openTicketsCount}
                    </span>
                  )}
                  {tab.id === "deals" && (
                    <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground">
                      {clientData.dealsAndProjects.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content Panels */}
          <div className="mt-6">
            {/* 1. OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Health Score Breakdown Card */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base font-semibold">
                          Health Score Breakdown ({clientData.health.score}/100)
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Algorithmic factors driving account retention and expansion likelihood
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className={cn("text-xs font-bold", healthColor)}>
                        {clientData.health.statusLabel}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {clientData.health.factors.map((factor) => {
                        const isCrit = factor.status === "critical";
                        const isWarn = factor.status === "warning";
                        return (
                          <div
                            key={factor.name}
                            className={cn(
                              "rounded-lg border p-3",
                              isCrit && "border-rose-500/30 bg-rose-500/[0.02]",
                              isWarn && "border-amber-500/30 bg-amber-500/[0.02]",
                            )}
                          >
                            <div className="flex items-center justify-between text-xs font-medium">
                              <span className="text-foreground">{factor.name}</span>
                              <span className="text-muted-foreground tabular-nums">
                                {factor.metric} (Weight {factor.weight}%)
                              </span>
                            </div>
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  factor.score >= 80
                                    ? "bg-emerald-500"
                                    : factor.score >= 50
                                      ? "bg-amber-500"
                                      : "bg-rose-500",
                                )}
                                style={{ width: `${factor.score}%` }}
                              />
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">{factor.summary}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Split Row: Monthly Production Throughput Chart + Studio & Client Contacts */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Monthly Production Throughput Chart */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <CardTitle className="text-sm font-semibold">
                            Monthly Production Throughput &amp; Volume
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Actual jobs &amp; deliverables across studio boards (Jan, Feb, Oct, Jobs)
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex rounded-md border border-border bg-muted/30 p-0.5 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setChartMetric("jobs")}
                              className={cn(
                                "px-2 py-0.5 rounded font-medium transition-colors cursor-pointer",
                                chartMetric === "jobs"
                                  ? "bg-background text-foreground shadow-xs font-bold"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              Jobs
                            </button>
                            <button
                              type="button"
                              onClick={() => setChartMetric("skus")}
                              className={cn(
                                "px-2 py-0.5 rounded font-medium transition-colors cursor-pointer",
                                chartMetric === "skus"
                                  ? "bg-background text-foreground shadow-xs font-bold"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              SKUs
                            </button>
                            <button
                              type="button"
                              onClick={() => setChartMetric("revenue")}
                              className={cn(
                                "px-2 py-0.5 rounded font-medium transition-colors cursor-pointer",
                                chartMetric === "revenue"
                                  ? "bg-background text-foreground shadow-xs font-bold"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              Invoiced ($)
                            </button>
                          </div>
                          <span className="text-xs font-bold text-foreground tabular-nums">
                            {chartMetric === "jobs"
                              ? `${clientData.kpis.totalJobsCount ?? clientData.revenueTrend.reduce((acc, curr) => acc + (curr.jobsCount ?? 0), 0)} Jobs`
                              : chartMetric === "skus"
                                ? `${clientData.kpis.totalSkusCount ?? clientData.revenueTrend.reduce((acc, curr) => acc + (curr.skusCount ?? 0), 0)} SKUs`
                                : canViewFinance
                                  ? `$${clientData.revenueTrend.reduce((acc, curr) => acc + curr.revenue, 0).toLocaleString()}`
                                  : "[Protected]"}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {chartMetric === "revenue" && !canViewFinance ? (
                        <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">
                          <Lock className="mr-1.5 size-4" /> Financial metrics restricted to Finance & Admin roles.
                        </div>
                      ) : (
                        <div className="h-[200px] w-full pt-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={clientData.revenueTrend}>
                              <defs>
                                <linearGradient id="metricGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop
                                    offset="5%"
                                    stopColor={chartMetric === "jobs" ? "#3b82f6" : chartMetric === "skus" ? "#8b5cf6" : "#10b981"}
                                    stopOpacity={0.4}
                                  />
                                  <stop
                                    offset="95%"
                                    stopColor={chartMetric === "jobs" ? "#3b82f6" : chartMetric === "skus" ? "#8b5cf6" : "#10b981"}
                                    stopOpacity={0}
                                  />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                              <YAxis
                                tick={{ fontSize: 11 }}
                                tickFormatter={(val) => (chartMetric === "revenue" ? `$${val / 1000}k` : `${val}`)}
                              />
                              <Tooltip
                                formatter={(val: any) => [
                                  chartMetric === "revenue" ? `$${Number(val).toLocaleString()}` : `${val} ${chartMetric}`,
                                  chartMetric === "jobs" ? "Jobs Logged" : chartMetric === "skus" ? "SKUs Processed" : "Invoiced Billing",
                                ]}
                              />
                              <Area
                                type="monotone"
                                dataKey={chartMetric === "jobs" ? "jobsCount" : chartMetric === "skus" ? "skusCount" : "revenue"}
                                stroke={chartMetric === "jobs" ? "#3b82f6" : chartMetric === "skus" ? "#8b5cf6" : "#10b981"}
                                fillOpacity={1}
                                fill="url(#metricGrad)"
                                strokeWidth={2}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Studio Team & Client Contacts Spotlight */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-sm font-semibold">Studio Team &amp; Contacts</CardTitle>
                          <CardDescription className="text-xs">
                            Assigned studio leadership &amp; linked account contacts
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setActiveTab("contacts")}
                          >
                            + Add Contact
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {clientData.keyContacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="size-9">
                              <AvatarFallback className="text-xs font-semibold">
                                {contact.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {contact.name}
                                </p>
                                {contact.isPrimary && (
                                  <Badge variant="outline" className="text-[10px] border-primary text-primary">
                                    Lead
                                  </Badge>
                                )}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {contact.title} · {contact.department}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              title={`Email ${contact.name}`}
                              onClick={() => {
                                setEmailForm({
                                  to: contact.email,
                                  subject: `Studio update regarding ${clientData.name}`,
                                  body: "",
                                });
                                setEmailModalOpen(true);
                              }}
                            >
                              <Mail className="size-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              title={`Call ${contact.phone}`}
                              onClick={() => {
                                setCallForm({
                                  contact: contact.name,
                                  duration: "15 mins",
                                  outcome: "Connected",
                                  notes: "",
                                });
                                setCallModalOpen(true);
                              }}
                            >
                              <Phone className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}

                      <div className="rounded-md border border-dashed border-border/70 bg-muted/20 p-2 text-center text-xs text-muted-foreground">
                        <span>Direct client points of contact are configurable. </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab("contacts")}
                          className="font-semibold text-primary underline underline-offset-2 hover:opacity-80 cursor-pointer"
                        >
                          Link external contact
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Split Row: Recent Wins & Friction Points */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card className="border-emerald-500/20 bg-emerald-500/[0.01]">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-emerald-500" />
                        <CardTitle className="text-sm font-semibold text-foreground">
                          Recent Milestones &amp; Wins
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {clientData.recentWins.map((win, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="mt-1 size-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>{win}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border-rose-500/20 bg-rose-500/[0.01]">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="size-4 text-rose-500" />
                        <CardTitle className="text-sm font-semibold text-foreground">
                          Friction Points &amp; Critical Watch Items
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {clientData.recentIssues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="mt-1 size-1.5 rounded-full bg-rose-500 shrink-0" />
                          <span>{issue}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* 2. ACTIVITY TAB (Unified Chronological Timeline) */}
            {activeTab === "activity" && (
              <div className="space-y-4">
                {/* Timeline Filters and Search */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search activity timeline..."
                      value={timelineSearch}
                      onChange={(e) => setTimelineSearch(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Role-based Saved Views */}
                    <div className="flex items-center rounded-lg border border-border p-0.5 text-xs">
                      {(["all", "sales", "support", "finance"] as const).map((view) => (
                        <button
                          key={view}
                          onClick={() => setTimelineRoleView(view)}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                            timelineRoleView === view
                              ? "bg-primary text-primary-foreground font-semibold"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {view} View
                        </button>
                      ))}
                    </div>

                    {/* Type Filter Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                          <Filter className="size-3 text-muted-foreground" />
                          {timelineFilter === "all" ? "All Types" : timelineFilter.toUpperCase()}
                          <ChevronDown className="size-3 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {["all", "email", "call", "meeting", "ticket", "payment", "usage", "note"].map((t) => (
                          <DropdownMenuItem
                            key={t}
                            onClick={() => setTimelineFilter(t)}
                            className="text-xs capitalize"
                          >
                            {t}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Timeline List */}
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  {filteredTimeline.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      No activities found matching your filters.
                    </div>
                  ) : (
                    filteredTimeline.map((item) => {
                      const iconMap = {
                        email: Mail,
                        call: Phone,
                        meeting: Calendar,
                        ticket: Headphones,
                        payment: CreditCard,
                        usage: Sparkles,
                        note: FileText,
                        deal: Briefcase,
                      };
                      const Icon = iconMap[item.type] ?? Clock;

                      return (
                        <div key={item.id} className="relative group">
                          {/* Dot on the timeline spine */}
                          <span className="absolute -left-[27px] top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-card shadow-xs group-hover:border-primary transition-colors">
                            <Icon className="size-2.5 text-muted-foreground group-hover:text-primary" />
                          </span>

                          <div className="rounded-lg border border-border bg-card p-3.5 transition-all hover:border-border/80 hover:shadow-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                  {item.type}
                                </span>
                                <h3 className="text-sm font-semibold text-foreground">
                                  {item.title}
                                </h3>
                              </div>
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {item.timestamp}
                              </span>
                            </div>

                            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                              {item.summary}
                            </p>

                            {item.details && (
                              <div className="mt-2.5 rounded-md bg-muted/40 p-2 text-xs text-foreground/90 font-mono text-[11px]">
                                {item.details}
                              </div>
                            )}

                            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground/80">
                              <span>By {item.author} {item.authorRole ? `(${item.authorRole})` : ""}</span>
                              {item.metadata && (
                                <div className="flex items-center gap-2">
                                  {Object.entries(item.metadata).map(([k, v]) => (
                                    <span key={k} className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
                                      {k}: {String(v)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* 3. DEALS & PROJECTS TAB */}
            {activeTab === "deals" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Active Deals &amp; SOWs</h3>
                  {canEdit && (
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => toast.info("New deal creation dialog")}
                    >
                      <Plus className="size-3.5" /> New Deal / Project
                    </Button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                      <tr>
                        <th className="p-3">Deal / Project Name</th>
                        <th className="p-3">Stage</th>
                        <th className="p-3">Value</th>
                        <th className="p-3">Probability</th>
                        <th className="p-3">Expected Close</th>
                        <th className="p-3">Owner</th>
                        <th className="p-3">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {clientData.dealsAndProjects.map((deal) => (
                        <tr key={deal.id} className="hover:bg-muted/20">
                          <td className="p-3 font-semibold text-foreground">
                            {deal.name}
                            <span className="block text-[11px] font-normal text-muted-foreground">
                              {deal.type}
                            </span>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-[11px]">
                              {deal.stage}
                            </Badge>
                          </td>
                          <td className="p-3 font-bold tabular-nums">
                            {canViewFinance ? (deal.value > 0 ? `${deal.value.toLocaleString()}` : "—") : "[Protected]"}
                          </td>
                          <td className="p-3 tabular-nums">{deal.probability}%</td>
                          <td className="p-3 text-muted-foreground">{deal.expectedClose}</td>
                          <td className="p-3">{deal.owner}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full bg-primary rounded-full"
                                  style={{ width: `${deal.progressPct}%` }}
                                />
                              </div>
                              <span className="tabular-nums text-muted-foreground text-[10px]">
                                {deal.progressPct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. BILLING TAB */}
            {activeTab === "billing" && (
              <div className="space-y-6">
                {!canViewFinance ? (
                  <div className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                    <Lock className="mx-auto mb-2 size-6 text-muted-foreground" />
                    Billing details and invoices are restricted for your current role ({currentRole}).
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <Card className="p-4">
                        <p className="text-xs text-muted-foreground">Contract Value</p>
                        <p className="text-2xl font-bold tabular-nums text-foreground">
                          {clientData.billing.arr > 0 ? `${clientData.billing.arr.toLocaleString()}` : "—"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {clientData.billing.arr > 0
                            ? `${clientData.billing.mrr.toLocaleString()} / month`
                            : "No contract value added yet"}
                        </p>
                      </Card>

                      <Card className="p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">Payment Terms</p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-[11px] text-primary gap-1"
                              >
                                <Edit2 className="size-3" />
                                Edit terms
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel className="text-xs">
                                Select Payment Terms
                              </DropdownMenuLabel>
                              {(
                                ["Immediate", "15 days", "30 days", "45 days", "Custom"] as const
                              ).map((t) => (
                                <DropdownMenuItem
                                  key={t}
                                  onClick={() =>
                                    handlePaymentTermsChange(
                                      t,
                                      t === "Custom" ? 60 : undefined
                                    )
                                  }
                                >
                                  {t} {t === "Immediate" ? "(Due on booking)" : ""}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="text-base font-semibold text-foreground">
                          {clientData.billing.paymentTerms || "30 days"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {clientData.billing.paymentMethod} • {clientData.billing.billingFrequency}
                        </p>
                      </Card>

                      <Card className="p-4">
                        <p className="text-xs text-muted-foreground">Corporate Tax ID</p>
                        <p className="text-sm font-mono font-medium text-foreground">
                          {clientData.billing.taxId}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Verified &amp; active</p>
                      </Card>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold">Invoices &amp; Production Billing</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAutomationsModalOpen(true)}
                          className="h-7 text-xs gap-1.5 text-primary border-primary/30 bg-primary/5"
                        >
                          <Zap className="size-3" />
                          Overdue Automation Rules
                        </Button>
                      </div>

                      {hasOverduePayment && (
                        <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 flex items-center justify-between text-xs text-red-700 dark:text-red-300">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="size-4 shrink-0 text-red-500" />
                            <span>
                              <strong>Overdue Payment Trigger Active:</strong> {overdueInvoices.length} invoice ({overdueInvoices.map(i => i.invoiceNumber).join(", ")}) is past due date. The automated escalation recipe has alerted workspace executive directors and project leads.
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs ml-3 shrink-0"
                            onClick={() => handleMarkInvoicePaid(overdueInvoices[0].id)}
                          >
                            Mark Paid &amp; Clear Alert
                          </Button>
                        </div>
                      )}

                      {clientData.billing.invoices.length === 0 ? (
                        <div className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                          <CreditCard className="mx-auto mb-2 size-6 text-muted-foreground" />
                          <p className="font-semibold text-foreground">No invoices recorded yet</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Invoice amounts and payment statuses will populate automatically once invoice columns are entered on boards.
                          </p>
                        </div>
                      ) : (
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                            <tr>
                              <th className="p-3">Invoice / Job</th>
                              <th className="p-3">Booked Date</th>
                              <th className="p-3">Terms</th>
                              <th className="p-3">Due Date</th>
                              <th className="p-3">Amount</th>
                              <th className="p-3">Payment Status</th>
                              <th className="p-3">Overdue</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {clientData.billing.invoices.map((inv) => (
                              <tr key={inv.id} className="hover:bg-muted/20">
                                <td className="p-3 font-semibold text-foreground">
                                  {inv.invoiceNumber}
                                </td>
                                <td className="p-3 text-muted-foreground">
                                  {inv.jobBookedDate || inv.issueDate}
                                </td>
                                <td className="p-3">
                                  <Badge variant="outline" className="text-[10px]">
                                    {inv.paymentTerms || clientData.billing.paymentTerms || "30 days"}
                                  </Badge>
                                </td>
                                <td className="p-3 text-muted-foreground font-medium">
                                  {inv.paymentDueDate || inv.dueDate}
                                </td>
                                <td className="p-3 font-bold tabular-nums">
                                  ${inv.amount.toLocaleString()}
                                </td>
                                <td className="p-3">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px]",
                                      inv.status === "Paid" &&
                                        "border-emerald-500 text-emerald-500 bg-emerald-500/10",
                                      inv.status === "Overdue" &&
                                        "border-rose-500 text-rose-500 bg-rose-500/10 font-bold animate-pulse",
                                      inv.status === "Pending" &&
                                        "border-amber-500 text-amber-500 bg-amber-500/10",
                                      inv.status === "Draft" &&
                                        "border-border text-muted-foreground"
                                    )}
                                  >
                                    {inv.paymentStatus || inv.status}
                                  </Badge>
                                </td>
                                <td className="p-3">
                                  {(inv.daysOverdue ?? 0) > 0 && inv.status !== "Paid" ? (
                                    <span className="inline-flex items-center rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                                      +{inv.daysOverdue} days
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground text-[11px]">—</span>
                                  )}
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {inv.status === "Overdue" ? (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="default"
                                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                          onClick={() => handleMarkInvoicePaid(inv.id)}
                                          title="Mark invoice as Paid and auto-resolve overdue alert"
                                        >
                                          Mark Paid
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="destructive"
                                          className="h-7 text-xs"
                                          onClick={() => {
                                            toast.success(
                                              `Overdue reminder email dispatched for ${inv.invoiceNumber}`
                                            );
                                          }}
                                        >
                                          Alert
                                        </Button>
                                      </>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs"
                                        onClick={() =>
                                          toast.info(`Downloading ${inv.invoiceNumber}`)
                                        }
                                      >
                                        PDF
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 5. SUPPORT TAB */}
            {activeTab === "support" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Support Tickets &amp; SLA Tracking</h3>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => toast.info("Create support ticket")}
                  >
                    <Plus className="size-3.5" /> File Ticket
                  </Button>
                </div>

                {clientData.support.tickets.length === 0 ? (
                  <div className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                    <Headphones className="mx-auto mb-2 size-6 text-muted-foreground" />
                    <p className="font-semibold text-foreground">No open support tickets</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      All studio deliverables progressing normally without active tickets.
                    </p>
                  </div>
                ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                      <tr>
                        <th className="p-3">Ticket ID</th>
                        <th className="p-3">Subject</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Priority</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Assignee</th>
                        <th className="p-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {clientData.support.tickets.map((t) => (
                        <tr key={t.id} className="hover:bg-muted/20">
                          <td className="p-3 font-mono font-semibold text-primary">{t.ticketNumber}</td>
                          <td className="p-3 font-medium text-foreground">{t.subject}</td>
                          <td className="p-3 text-muted-foreground">{t.category}</td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                t.priority === "Urgent" && "border-rose-500 text-rose-500 bg-rose-500/10 font-bold",
                                t.priority === "High" && "border-amber-500 text-amber-500 bg-amber-500/10",
                                t.priority === "Medium" && "border-blue-500 text-blue-500 bg-blue-500/10",
                                t.priority === "Low" && "border-border text-muted-foreground",
                              )}
                            >
                              {t.priority}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge variant="secondary" className="text-[10px]">
                              {t.status}
                            </Badge>
                          </td>
                          <td className="p-3">{t.assignee}</td>
                          <td className="p-3 text-muted-foreground">{t.createdAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            )}

            {/* 6. DOCUMENTS TAB */}
            {activeTab === "documents" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Contracts &amp; Legal Documents</h3>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                    <Plus className="size-3.5" /> Upload Document
                  </Button>
                </div>

                {clientData.documents.length === 0 ? (
                  <div className="rounded-lg border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                    <FileText className="mx-auto mb-2 size-6 text-muted-foreground" />
                    <p className="font-semibold text-foreground">No documents uploaded yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Upload SOWs, MSAs, or style guide documents for this client.
                    </p>
                  </div>
                ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {clientData.documents.map((doc) => (
                    <Card key={doc.id} className="p-4 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px]">
                            {doc.category}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{doc.fileSize}</span>
                        </div>
                        <p className="text-xs font-semibold text-foreground break-all">{doc.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Uploaded {doc.uploadedAt} by {doc.uploadedBy}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                        <span
                          className={cn(
                            "text-[10px] font-medium",
                            doc.status === "Expiring Soon" ? "text-rose-500 font-bold" : "text-muted-foreground",
                          )}
                        >
                          {doc.status}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-primary"
                          onClick={() => toast.info(`Viewing ${doc.name}`)}
                        >
                          View PDF
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
                )}
              </div>
            )}

            {/* 7. CONTACTS TAB */}
            {activeTab === "contacts" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Stakeholders &amp; Key Contacts</h3>
                  {canEdit && (
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => toast.info("Add new contact")}
                    >
                      <Plus className="size-3.5" /> Add Contact
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {clientData.keyContacts.map((contact) => (
                    <Card key={contact.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-10">
                            <AvatarFallback className="text-xs font-bold">
                              {contact.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-bold text-foreground">{contact.name}</p>
                            <p className="text-xs text-muted-foreground">{contact.title}</p>
                          </div>
                        </div>
                        {contact.isDecisionMaker && (
                          <Badge variant="outline" className="border-primary text-primary text-[10px]">
                            Decision Maker
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground pt-1 border-t border-border">
                        <p className="flex items-center gap-1.5">
                          <Mail className="size-3 text-muted-foreground" />
                          <a href={`mailto:${contact.email}`} className="hover:underline text-foreground">
                            {contact.email}
                          </a>
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Phone className="size-3 text-muted-foreground" />
                          <a href={`tel:${contact.phone}`} className="hover:underline">
                            {contact.phone}
                          </a>
                        </p>
                        <p className="text-[11px] pt-1">Last contacted: {contact.lastContacted}</p>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-border">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 flex-1 text-xs"
                          onClick={() => {
                            setEmailForm({ to: contact.email, subject: "", body: "" });
                            setEmailModalOpen(true);
                          }}
                        >
                          <Mail className="mr-1 size-3" /> Email
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 flex-1 text-xs"
                          onClick={() => {
                            setCallForm({ contact: contact.name, duration: "15 mins", outcome: "Connected", notes: "" });
                            setCallModalOpen(true);
                          }}
                        >
                          <Phone className="mr-1 size-3" /> Call
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* 8. NOTES TAB */}
            {activeTab === "notes" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Account Notes &amp; Meeting Logs</h3>
                  {canEdit && (
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => setNoteModalOpen(true)}
                    >
                      <Plus className="size-3.5" /> Add Note
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  {clientData.notes.map((note) => {
                    const isRestricted = note.isConfidential && !canViewConfidentialNotes;

                    return (
                      <Card key={note.id} className={cn("p-4", note.isPinned && "border-primary/50 bg-primary/[0.01]")}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {note.isPinned && (
                              <Badge variant="secondary" className="text-[10px]">
                                Pinned
                              </Badge>
                            )}
                            {note.isConfidential && (
                              <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-500">
                                Confidential
                              </Badge>
                            )}
                            <h4 className="text-sm font-bold text-foreground">{note.title}</h4>
                          </div>
                          <span className="text-[11px] text-muted-foreground">{note.createdAt}</span>
                        </div>

                        <p className={cn("mt-2 text-xs leading-relaxed", isRestricted ? "italic text-muted-foreground filter blur-xs select-none" : "text-foreground")}>
                          {isRestricted
                            ? "This note contains confidential strategic details visible only to Account Executive & Admin roles."
                            : note.content}
                        </p>

                        <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border">
                          <span>By {note.author} ({note.authorRole})</span>
                          <div className="flex items-center gap-1">
                            {note.tags.map((t) => (
                              <span key={t} className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
                                #{t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ── Right Sidebar: Company Info, Tags, Assigned Team, Data Syncs ── */}
        <aside
          className={cn(
            "w-full border-t border-border bg-card p-5 lg:w-80 lg:shrink-0 lg:border-t-0 lg:border-l",
            !mobileSidebarOpen && "hidden lg:block",
          )}
        >
          <div className="space-y-6">
            {/* Company Profile Info */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Company Profile
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Legal Name</span>
                  <span className="font-medium text-foreground text-right truncate max-w-[170px]">
                    {clientData.legalName}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Industry</span>
                  <span className="font-medium text-foreground text-right truncate max-w-[170px]">
                    {clientData.industry}
                  </span>
                </div>
                {clientData.employees && (
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Employees</span>
                    <span className="font-medium text-foreground">{clientData.employees}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-border/50 items-center">
                  <span className="text-muted-foreground">Payment Terms</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="font-semibold text-primary hover:underline flex items-center gap-1 text-xs">
                        {clientData.billing.paymentTerms || "30 days"}
                        <ChevronDown className="size-3 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel className="text-xs">Payment Terms</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {(["Immediate", "15 days", "30 days", "45 days", "Custom"] as const).map(
                        (term) => (
                          <DropdownMenuItem
                            key={term}
                            onClick={() =>
                              handlePaymentTermsChange(
                                term,
                                term === "Custom" ? 60 : undefined
                              )
                            }
                            className="text-xs"
                          >
                            {term} {term === "Immediate" ? "(Due on booking)" : ""}
                          </DropdownMenuItem>
                        )
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Timezone</span>
                  <span className="font-medium text-foreground">{clientData.timezone}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">HQ Location</span>
                  <span className="font-medium text-foreground text-right">{clientData.hqLocation}</span>
                </div>
              </div>
            </div>

            {/* Social & Web Links */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Online Presence
              </h3>
              <div className="flex flex-wrap gap-2 text-xs">
                {clientData.socialLinks.website && (
                  <a
                    href={clientData.socialLinks.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground hover:text-foreground"
                  >
                    <Globe className="size-3" /> Website
                  </a>
                )}
                {clientData.socialLinks.linkedin && (
                  <a
                    href={clientData.socialLinks.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-3" /> LinkedIn
                  </a>
                )}
                {clientData.socialLinks.twitter && (
                  <a
                    href={clientData.socialLinks.twitter}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground hover:text-foreground"
                  >
                    <Share2 className="size-3" /> Twitter/X
                  </a>
                )}
              </div>
            </div>

            {/* Account Tags */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Tags &amp; Segmentation
                </h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {clientData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px] font-medium">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Assigned Studio & Account Team */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Assigned Team
              </h3>
              <div className="space-y-2.5">
                {clientData.assignedTeam.map((member) => (
                  <div key={member.name} className="flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-foreground flex items-center gap-1">
                        {member.name}
                        {member.isLead && (
                          <span className="text-[9px] bg-primary/10 text-primary font-bold px-1 rounded">
                            Lead
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{member.role}</p>
                    </div>
                    <a
                      href={`mailto:${member.email}`}
                      className="text-muted-foreground hover:text-primary"
                      title={member.email}
                    >
                      <Mail className="size-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Data Source Sync Status */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Connected Data Sources
                </h3>
                <button
                  onClick={handleManualSync}
                  className="text-[10px] text-primary hover:underline font-medium"
                >
                  Sync all
                </button>
              </div>

              <div className="space-y-2">
                {clientData.dataSources.map((ds) => (
                  <div
                    key={ds.name}
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">{ds.name}</p>
                        <p className="text-[10px] text-muted-foreground">{ds.provider}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{ds.lastSyncedText}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Dialogs: Email, Log Call, Add Task, Add Note ── */}

      {/* 1. Email Modal */}
      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Email</DialogTitle>
            <DialogDescription>
              Draft and dispatch an email directly to {clientData.name} contacts.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendEmail} className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input
                value={emailForm.to}
                onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })}
                placeholder="contact@safaricreative.com"
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Subject</label>
              <Input
                value={emailForm.subject}
                onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                placeholder="Subject line"
                className="mt-1 h-8 text-xs"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Message</label>
              <Textarea
                value={emailForm.body}
                onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })}
                placeholder="Type your message..."
                rows={4}
                className="mt-1 text-xs"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEmailModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                <Send className="mr-1.5 size-3" /> Send Email
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 2. Log Call Modal */}
      <Dialog open={callModalOpen} onOpenChange={setCallModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Phone / Video Call</DialogTitle>
            <DialogDescription>
              Record an interaction with {clientData.name} stakeholders.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLogCall} className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Contact</label>
              <Input
                value={callForm.contact}
                onChange={(e) => setCallForm({ ...callForm, contact: e.target.value })}
                placeholder="Contact name"
                className="mt-1 h-8 text-xs"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Duration</label>
                <Input
                  value={callForm.duration}
                  onChange={(e) => setCallForm({ ...callForm, duration: e.target.value })}
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Outcome</label>
                <Input
                  value={callForm.outcome}
                  onChange={(e) => setCallForm({ ...callForm, outcome: e.target.value })}
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes &amp; Takeaways</label>
              <Textarea
                value={callForm.notes}
                onChange={(e) => setCallForm({ ...callForm, notes: e.target.value })}
                placeholder="Summary of conversation..."
                rows={3}
                className="mt-1 text-xs"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCallModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save Call Log
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 3. Add Task Modal */}
      <Dialog open={taskModalOpen} onOpenChange={setTaskModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Action Item / Task</DialogTitle>
            <DialogDescription>
              Surface a prioritized task under Next Best Actions for this client.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddTask} className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Task Title</label>
              <Input
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="e.g. Follow up on Q4 renewal proposal"
                className="mt-1 h-8 text-xs"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Assignee</label>
                <Input
                  value={taskForm.assignee}
                  onChange={(e) => setTaskForm({ ...taskForm, assignee: e.target.value })}
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Due Date</label>
                <Input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <select
                value={taskForm.priority}
                onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as any })}
                className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="critical">Critical (Immediate action)</option>
                <option value="high">High priority</option>
                <option value="medium">Medium priority</option>
              </select>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setTaskModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Add Action Item
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 4. Add Note Modal */}
      <Dialog open={noteModalOpen} onOpenChange={setNoteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Account Note</DialogTitle>
            <DialogDescription>
              Save internal context, meeting takeaways, or strategic notes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddNote} className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={noteForm.title}
                onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                placeholder="Note title"
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Content</label>
              <Textarea
                value={noteForm.content}
                onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
                placeholder="Write your note..."
                rows={4}
                className="mt-1 text-xs"
                required
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={noteForm.isConfidential}
                  onChange={(e) => setNoteForm({ ...noteForm, isConfidential: e.target.checked })}
                  className="rounded border-border"
                />
                <span className="text-muted-foreground">Mark as confidential (Leadership only)</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={noteForm.isPinned}
                  onChange={(e) => setNoteForm({ ...noteForm, isPinned: e.target.checked })}
                  className="rounded border-border"
                />
                <span className="text-muted-foreground">Pin to top</span>
              </label>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setNoteModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save Note
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. Automation Center Modal */}
      <AutomationCenterModal
        open={automationsModalOpen}
        onOpenChange={setAutomationsModalOpen}
        boardId={`client-${clientData.id}`}
        boardName={`${clientData.name} Production`}
        initialTab="overdue-settings"
      />
    </div>
  );
}
