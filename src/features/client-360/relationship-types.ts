export type LifecycleStage = "Lead" | "Active" | "At Risk" | "Churned";

export type HealthScoreTrend = "up" | "down" | "flat";

export type HealthFactorStatus = "excellent" | "good" | "warning" | "critical";

export interface HealthFactor {
  name: string;
  weight: number; // percentage e.g. 30
  score: number; // 0-100
  status: HealthFactorStatus;
  summary: string;
  metric: string;
}

export interface ClientHealthScore {
  score: number; // 0-100
  trend: HealthScoreTrend;
  change: number; // e.g. +6 or -12 points
  statusLabel: string; // e.g. "Excellent", "Healthy", "Needs Attention", "Critical"
  factors: HealthFactor[];
}

export interface NextBestAction {
  id: string;
  priority: "critical" | "high" | "medium";
  category: "Billing" | "Support" | "Renewal" | "Engagement" | "Sales" | "Production";
  title: string;
  reason: string;
  impact: string;
  dueDate?: string;
  actionLabel: string;
  actionType: "email" | "call" | "invoice" | "review" | "task" | "renew";
  completed?: boolean;
}

export interface ClientKpis {
  revenueYtd: number;
  openDealsCount: number;
  openDealsValue: number;
  openTicketsCount: number;
  urgentTicketsCount: number;
  lastContactDate: string;
  npsScore: number;
  csatScore: number;
  totalJobsCount?: number;
  activeBatchesCount?: number;
  avgTatDays?: number;
  totalSkusCount?: number;
  overdueInvoicesCount?: number;
}

export interface KeyContact {
  id: string;
  name: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  isPrimary: boolean;
  isDecisionMaker: boolean;
  lastContacted: string;
  preferredChannel: "Email" | "Phone" | "Slack";
}

export interface DealProject {
  id: string;
  name: string;
  type: "Subscription Renewal" | "Expansion" | "Implementation" | "Pilot" | "Custom Work" | "Studio Batch";
  stage: "Prospecting" | "Proposal" | "Negotiation" | "Closed Won" | "In Delivery" | "Completed" | "Delivered";
  value: number;
  expectedClose: string;
  owner: string;
  probability: number;
  progressPct: number;
  health: "good" | "warning" | "critical";
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  jobBookedDate?: string;
  dueDate: string;
  paymentDueDate?: string;
  paymentTerms?: "Immediate" | "15 days" | "30 days" | "45 days" | "Custom";
  amount: number;
  paidAmount?: number;
  status: "Paid" | "Pending" | "Overdue" | "Draft";
  paymentStatus?: "Unpaid" | "Partially paid" | "Paid";
  daysOverdue?: number;
  itemsCount: number;
  downloadUrl?: string;
}

export interface ClientBillingInfo {
  arr: number;
  mrr: number;
  lifetimeValue: number;
  paymentTerms: "Immediate" | "15 days" | "30 days" | "45 days" | "Custom";
  customPaymentDays?: number;
  paymentMethod: string;
  billingFrequency: "Monthly" | "Quarterly" | "Annual";
  currency: string;
  taxId?: string;
  invoices: Invoice[];
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  priority: "Urgent" | "High" | "Medium" | "Low";
  status: "Open" | "In Progress" | "Waiting on Client" | "Resolved";
  createdAt: string;
  updatedAt: string;
  assignee: string;
  category: "Product Bug" | "Billing Query" | "Feature Request" | "API Issue" | "Integration";
}

export interface ClientDocument {
  id: string;
  name: string;
  category: "Master Agreement" | "NDA" | "SOW" | "Security Audit" | "Invoice Spec";
  fileSize: string;
  uploadedAt: string;
  uploadedBy: string;
  expiresAt?: string;
  status: "Active" | "Expiring Soon" | "Archived";
}

export interface ClientNote {
  id: string;
  title: string;
  content: string;
  author: string;
  authorRole: string;
  createdAt: string;
  isPinned: boolean;
  isConfidential: boolean; // hidden or masked for non-authorized roles
  tags: string[];
}

export type ActivityType =
  | "email"
  | "call"
  | "meeting"
  | "ticket"
  | "payment"
  | "usage"
  | "note"
  | "deal";

export interface TimelineActivity {
  id: string;
  type: ActivityType;
  title: string;
  summary: string;
  details?: string;
  author: string;
  authorRole?: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface DataSourceSync {
  name: string;
  type: "crm" | "support" | "billing" | "usage" | "database" | "storage" | "boards";
  provider: string;
  status: "synced" | "syncing" | "error";
  lastSyncedText: string;
  lastSyncedIso: string;
}

export interface AssignedTeamMember {
  role: string;
  name: string;
  email: string;
  avatarUrl?: string;
  isLead?: boolean;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  target?: number;
  jobsCount?: number;
  skusCount?: number;
}

export interface Client360Profile {
  id: string;
  name: string;
  legalName: string;
  logoUrl?: string;
  domain: string;
  industry: string;
  employees?: string;
  hqLocation: string;
  timezone: string;
  accountOwner: {
    name: string;
    email: string;
    role: string;
  };
  lifecycleStage: LifecycleStage;
  health: ClientHealthScore;
  financials: {
    lifetimeValue: number;
    arr: number;
    revenueYtd: number;
    contractStartDate: string;
    contractRenewalDate: string;
    renewalDaysLeft: number;
    contractTier: string;
  };
  kpis: ClientKpis;
  nextBestActions: NextBestAction[];
  keyContacts: KeyContact[];
  dealsAndProjects: DealProject[];
  billing: ClientBillingInfo;
  support: {
    openTickets: number;
    avgFirstResponseHours: number;
    avgResolutionDays: number;
    tickets: SupportTicket[];
  };
  documents: ClientDocument[];
  notes: ClientNote[];
  timeline: TimelineActivity[];
  revenueTrend: MonthlyRevenue[];
  recentWins: string[];
  recentIssues: string[];
  assignedTeam: AssignedTeamMember[];
  tags: string[];
  socialLinks: {
    website?: string;
    linkedin?: string;
    twitter?: string;
  };
  dataSources: DataSourceSync[];
}

export type UserViewRole = "Admin" | "Sales" | "Support" | "Finance" | "Viewer";
