import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockClients = [
  { id: "client-first", name: "Alpha Corp", aliases: ["alpha"], jobs: 5, boardCount: 2 },
  { id: "client-middle", name: "Beta Ltd", aliases: ["beta"], jobs: 3, boardCount: 1 },
  { id: "client-last", name: "Gamma Inc", aliases: ["gamma"], jobs: 0, boardCount: 0 },
];

vi.mock("@/features/client-360/actions", () => ({
  getClient360RelationshipClientsAction: vi.fn(),
  getClient360RelationshipProfileAction: vi.fn(),
  getClientAnalyticsAction: vi.fn(),
}));

const { createClient } = vi.hoisted(() => {
  const chain = { on: () => chain, subscribe: () => ({ unsubscribe: () => {} }) };
  return {
    createClient: () => ({ channel: () => chain, removeChannel: () => {} }),
  };
});

vi.mock("@/lib/supabase/client", () => ({ createClient }));
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() })),
  usePathname: vi.fn(() => "/client-360"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

import {
  getClient360RelationshipClientsAction,
  getClient360RelationshipProfileAction,
  getClientAnalyticsAction,
} from "@/features/client-360/actions";
import { RelationshipClient360 } from "@/features/client-360/relationship-client-360";

beforeEach(() => {
  vi.clearAllMocks();
  (getClientAnalyticsAction as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: {
      kpis: { totalJobs: 0, inProgress: 0, done: 0, totalSkus: 0, totalImages: 0, avgTurnaroundDays: null, shareOfStudioVolume: 0 },
      statusBreakdown: [], jobTypeMix: [], jobsByBoard: [], skuByMonth: [],
      receivedVsCompletedByMonth: [], turnaroundByMonth: [], studioAvgTurnaroundDays: null,
      workloadByOwner: [], recentJobs: [], excluded: { noReceivedDate: 0, noUploadDate: 0, brokenLinks: 0 },
    },
    error: null,
  });
  (getClient360RelationshipClientsAction as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: mockClients,
    error: null,
    status: 200,
    jobsWithoutClient: 0,
    possibleDuplicates: [],
  });
  (getClient360RelationshipProfileAction as ReturnType<typeof vi.fn>).mockImplementation((clientId) => {
    const name = mockClients.find((c) => c.id === clientId)?.name ?? clientId;
    return Promise.resolve({
      data: {
        id: clientId,
        name,
        legalName: name,
        domain: "",
        industry: "Not added",
        hqLocation: "Not added",
        timezone: "Asia/Kolkata",
        accountOwner: { name: "Not added", email: "", role: "Not added" },
        lifecycleStage: "Active",
        financials: { lifetimeValue: 0, arr: 0, revenueYtd: 0, contractStartDate: "", contractRenewalDate: "", renewalDaysLeft: 0, contractTier: "Production" },
        kpis: { totalJobsCount: 0, activeBatchesCount: 0, avgTatDays: 0, totalSkusCount: 0, overdueInvoicesCount: 0 },
        nextBestActions: [],
        keyContacts: [],
        dealsAndProjects: [],
        billing: { arr: 0, mrr: 0, lifetimeValue: 0, paymentTerms: "Not added", paymentTermDays: null, paymentMethod: "—", billingFrequency: "Monthly", currency: "—", invoices: [] },
        support: { openTickets: 0, avgFirstResponseHours: 0, avgResolutionDays: 0, tickets: [] },
        documents: [],
        notes: [],
        timeline: [],
        revenueTrend: [],
        recentWins: [],
        recentIssues: [],
        assignedTeam: [],
        tags: [],
        socialLinks: {},
        dataSources: [],
        canViewBilling: false,
      },
      error: null,
      status: 200,
    });
  });
});

describe("Client 360 dropdown selection", () => {
  it("selects the first client, updates the trigger, and loads the profile", async () => {
    const user = userEvent.setup();
    render(<RelationshipClient360 />);

    await user.click(screen.getByRole("button", { name: "Select a client" }));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Alpha Corp" })).toBeInTheDocument());
    await user.click(screen.getByRole("menuitem", { name: "Alpha Corp" }));

    await waitFor(() =>
      expect(getClient360RelationshipProfileAction).toHaveBeenCalledWith("client-first"),
    );
    expect(screen.getByRole("button", { name: "Alpha Corp" })).toBeInTheDocument();
  });

  it("selects a middle client and a last client (zero jobs still loads a profile)", async () => {
    const user = userEvent.setup();
    render(<RelationshipClient360 />);

    await user.click(screen.getByRole("button", { name: "Select a client" }));
    await user.click(screen.getByRole("menuitem", { name: "Beta Ltd" }));
    await waitFor(() =>
      expect(getClient360RelationshipProfileAction).toHaveBeenCalledWith("client-middle"),
    );

    await user.click(screen.getByRole("button", { name: "Beta Ltd" }));
    await user.click(screen.getByRole("menuitem", { name: "Gamma Inc" }));
    await waitFor(() =>
      expect(getClient360RelationshipProfileAction).toHaveBeenCalledWith("client-last"),
    );
  });

  it("selects a client after searching the filtered list", async () => {
    const user = userEvent.setup();
    render(<RelationshipClient360 />);

    await user.click(screen.getByRole("button", { name: "Select a client" }));
    const input = screen.getByPlaceholderText("Search clients...");
    await user.type(input, "Gamma");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Gamma Inc" })).toBeInTheDocument());
    await user.click(screen.getByRole("menuitem", { name: "Gamma Inc" }));
    await waitFor(() =>
      expect(getClient360RelationshipProfileAction).toHaveBeenCalledWith("client-last"),
    );
  });
});
