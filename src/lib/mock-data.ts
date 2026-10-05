export interface OverviewMetric {
  id: string;
  label: string;
  value: string;
  delta: string;
  deltaDirection: "up" | "down" | "flat";
}

export interface ActivityEvent {
  id: string;
  icon: string;
  title: string;
  detail: string;
  timestamp: string;
}

export interface WeeklyVolumePoint {
  day: string;
  label: string;
  jobs: number;
}

export interface WorkloadItem {
  team: string;
  jobs: number;
  items: number;
  percentage: number;
}

export const mockWorkspaceName = "Powerweave Studio";

export const overviewMetrics: OverviewMetric[] = [
  { id: "active", label: "Active jobs", value: "24", delta: "↑ 3 from last week", deltaDirection: "up" },
  { id: "review", label: "In review", value: "7", delta: "↑ 2 from last week", deltaDirection: "up" },
  { id: "skus", label: "SKUs this month", value: "1,420", delta: "↑ 12% vs prior", deltaDirection: "up" },
  { id: "turnaround", label: "Avg. turnaround", value: "2.4d", delta: "↓ 0.3d improved", deltaDirection: "up" },
];

export const activityEvents: ActivityEvent[] = [
  {
    id: "1",
    icon: "CheckCheck",
    title: "Brand refresh approved",
    detail: "Cosmética Natural — Phase 2 final delivery approved",
    timestamp: "18 min ago",
  },
  {
    id: "2",
    icon: "ListChecks",
    title: "QC checkpoint passed",
    detail: "4K Campaign — 12 items moved to QC review",
    timestamp: "42 min ago",
  },
  {
    id: "3",
    icon: "Clock",
    title: "PO received",
    detail: "Apex Studios — Production order #4821 received",
    timestamp: "1 hr ago",
  },
  {
    id: "4",
    icon: "Activity",
    title: "Invoice raised",
    detail: "GreenLeaf Co — Invoice #INV-2904 for $8,200",
    timestamp: "3 hr ago",
  },
  {
    id: "5",
    icon: "CheckCheck",
    title: "Batch completed",
    detail: "Sunset Foods — 8 product shots delivered",
    timestamp: "5 hr ago",
  },
  {
    id: "6",
    icon: "Zap",
    title: "Agent completed task",
    detail: "Format agent batch for Nova Tech — 24 files",
    timestamp: "Yesterday",
  },
  {
    id: "7",
    icon: "ListChecks",
    title: "Deck shared",
    detail: "Meridian Health — Investor presentation shared",
    timestamp: "Yesterday",
  },
  {
    id: "8",
    icon: "Clock",
    title: "Post-production started",
    detail: "Brighton Bakery — Video edit timeline opened",
    timestamp: "Jun 14",
  },
];

export const weeklyVolume: WeeklyVolumePoint[] = [
  { day: "mon", label: "Mon", jobs: 12 },
  { day: "tue", label: "Tue", jobs: 18 },
  { day: "wed", label: "Wed", jobs: 9 },
  { day: "thu", label: "Thu", jobs: 22 },
  { day: "fri", label: "Fri", jobs: 15 },
  { day: "sat", label: "Sat", jobs: 6 },
  { day: "sun", label: "Sun", jobs: 3 },
];

export const workloadByTeam: WorkloadItem[] = [
  { team: "Design", jobs: 12, items: 48, percentage: 60 },
  { team: "Post-Production", jobs: 8, items: 31, percentage: 40 },
  { team: "Photo", jobs: 5, items: 22, percentage: 25 },
  { team: "Video", jobs: 3, items: 14, percentage: 15 },
];

export interface AnalyticsMetric {
  id: string;
  label: string;
  value: string;
  delta: string;
  deltaDirection: "up" | "down" | "flat";
}

export const analyticsMetrics: AnalyticsMetric[] = [
  { id: "completed", label: "Jobs / items completed", value: "847", delta: "↑ 8.1% vs prior period", deltaDirection: "up" },
  { id: "turnaround", label: "Avg. time to review", value: "2.1d", delta: "↓ 12% vs prior period", deltaDirection: "up" },
  { id: "approval", label: "Approval rate", value: "94%", delta: "↑ 3.2% vs prior period", deltaDirection: "up" },
];

export interface ThroughputPoint {
  date: string;
  label: string;
  throughput: number;
}

export const throughputData: ThroughputPoint[] = [
  { date: "2026-05-25", label: "May 25", throughput: 32 },
  { date: "2026-05-28", label: "May 28", throughput: 45 },
  { date: "2026-05-31", label: "May 31", throughput: 28 },
  { date: "2026-06-03", label: "Jun 3", throughput: 52 },
  { date: "2026-06-06", label: "Jun 6", throughput: 38 },
  { date: "2026-06-09", label: "Jun 9", throughput: 61 },
  { date: "2026-06-12", label: "Jun 12", throughput: 47 },
  { date: "2026-06-15", label: "Jun 15", throughput: 55 },
  { date: "2026-06-17", label: "Jun 17", throughput: 49 },
];

export interface WorkMixItem {
  category: string;
  percentage: number;
  color: string;
}

export const workMixData: WorkMixItem[] = [
  { category: "Design", percentage: 35, color: "#142850" },
  { category: "Post-Production", percentage: 28, color: "#3b82f6" },
  { category: "Photo", percentage: 22, color: "#10b981" },
  { category: "Video", percentage: 15, color: "#f59e0b" },
];

export interface ClientDirectoryItem {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  status: "Healthy" | "Watch" | "Paused";
  category: string;
  jobs: number;
  items: number;
  lastActivity: string;
}

export const clientDirectory: ClientDirectoryItem[] = [
  {
    id: "c1",
    name: "Cosmética Natural",
    initials: "CN",
    avatarColor: "bg-emerald-500",
    status: "Healthy",
    category: "Beauty / Skincare",
    jobs: 8,
    items: 42,
    lastActivity: "2 hr ago",
  },
  {
    id: "c2",
    name: "Apex Studios",
    initials: "AS",
    avatarColor: "bg-blue-500",
    status: "Healthy",
    category: "Media / Production",
    jobs: 12,
    items: 67,
    lastActivity: "18 min ago",
  },
  {
    id: "c3",
    name: "GreenLeaf Co",
    initials: "GL",
    avatarColor: "bg-emerald-600",
    status: "Watch",
    category: "Food / Organic",
    jobs: 5,
    items: 28,
    lastActivity: "1 day ago",
  },
  {
    id: "c4",
    name: "Sunset Foods",
    initials: "SF",
    avatarColor: "bg-amber-500",
    status: "Healthy",
    category: "Food / Packaged",
    jobs: 6,
    items: 34,
    lastActivity: "3 hr ago",
  },
  {
    id: "c5",
    name: "Brighton Bakery",
    initials: "BB",
    avatarColor: "bg-rose-500",
    status: "Paused",
    category: "Food / Bakery",
    jobs: 2,
    items: 11,
    lastActivity: "3 days ago",
  },
  {
    id: "c6",
    name: "Nova Tech",
    initials: "NT",
    avatarColor: "bg-sky-500",
    status: "Healthy",
    category: "Technology / SaaS",
    jobs: 9,
    items: 52,
    lastActivity: "5 hr ago",
  },
  {
    id: "c7",
    name: "Meridian Health",
    initials: "MH",
    avatarColor: "bg-teal-500",
    status: "Watch",
    category: "Healthcare / Pharma",
    jobs: 7,
    items: 39,
    lastActivity: "Yesterday",
  },
  {
    id: "c8",
    name: "Pinnacle Auto",
    initials: "PA",
    avatarColor: "bg-indigo-500",
    status: "Healthy",
    category: "Automotive",
    jobs: 4,
    items: 21,
    lastActivity: "Yesterday",
  },
  {
    id: "c9",
    name: "Wildflower Apparel",
    initials: "WA",
    avatarColor: "bg-purple-500",
    status: "Healthy",
    category: "Fashion / Apparel",
    jobs: 6,
    items: 33,
    lastActivity: "4 hr ago",
  },
];
