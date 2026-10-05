import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

import { DailyListsSection } from "@/features/overview/daily-lists-section";
import type {
  DailyListPanelId,
  DailyListPanelPayload,
} from "@/features/overview/daily-lists";

function payload(
  panel: DailyListPanelId,
  overrides: Partial<DailyListPanelPayload> = {},
): DailyListPanelPayload {
  return {
    panel,
    title:
      panel === "today"
        ? "Today's jobs"
        : panel === "overdue"
          ? "Overdue"
          : "Upcoming",
    description: "test",
    anchorDate: "2026-09-24",
    horizonDate: panel === "upcoming" ? "2026-10-01" : null,
    items: [],
    truncated: false,
    boardsWithoutDueDate: 0,
    ...overrides,
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    record_id: "rec-1",
    item_name: "Winter lookbook",
    status: "In progress",
    job_date: null,
    due_date: "2026-09-20",
    matched: [],
    board_id: "board-1",
    board_name: "Retouching",
    board_slug: "retouching",
    workspace_id: "ws-1",
    workspace_name: "Powerweave Studio",
    href: "/retouching",
    ...overrides,
  };
}

const fetchMock = vi.fn();

function respondWith(handler: (panel: string) => { status: number; body: unknown }) {
  fetchMock.mockImplementation((url: string) => {
    const panel = new URL(url, "http://localhost").searchParams.get("panel") ?? "";
    const { status, body } = handler(panel);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response);
  });
}

function panelEl(title: string): HTMLElement {
  return screen.getByRole("heading", { name: new RegExp(title, "i") }).closest(
    "div",
  )!.parentElement!.parentElement!;
}

describe("DailyListsSection", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders all three panels and asks for each one separately", async () => {
    respondWith((panel) => ({ status: 200, body: payload(panel as DailyListPanelId) }));

    render(<DailyListsSection />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const urls = fetchMock.mock.calls.map((call) => call[0] as string).sort();
    expect(urls).toEqual([
      "/api/overview/daily-lists?panel=overdue",
      "/api/overview/daily-lists?panel=today",
      "/api/overview/daily-lists?panel=upcoming",
    ]);
  });

  it("shows each item's name, board and workspace, linked back to its board", async () => {
    respondWith((panel) =>
      panel === "overdue"
        ? { status: 200, body: payload("overdue", { items: [item()] }) }
        : { status: 200, body: payload(panel as DailyListPanelId) },
    );

    render(<DailyListsSection />);

    const link = await screen.findByRole("link", { name: /Winter lookbook/ });
    expect(link).toHaveAttribute("href", "/retouching");
    const row = link.closest("li")!;
    expect(within(row).getByText("Retouching")).toBeInTheDocument();
    expect(within(row).getByText("Powerweave Studio")).toBeInTheDocument();
    expect(within(row).getByText("In progress")).toBeInTheDocument();
  });

  it("shows an empty state per panel instead of a placeholder item", async () => {
    respondWith((panel) => ({ status: 200, body: payload(panel as DailyListPanelId) }));

    render(<DailyListsSection />);

    expect(await screen.findByText("Nothing scheduled for today")).toBeInTheDocument();
    expect(screen.getByText("Nothing overdue")).toBeInTheDocument();
    expect(screen.getByText("Nothing due this week")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("isolates a failure to one panel and leaves the others populated", async () => {
    respondWith((panel) =>
      panel === "upcoming"
        ? { status: 500, body: { error: "Failed to load upcoming: timeout" } }
        : {
            status: 200,
            body: payload(panel as DailyListPanelId, { items: [item()] }),
          },
    );

    render(<DailyListsSection />);

    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent("Failed to load upcoming: timeout");
    expect(failure).toHaveTextContent("Upcoming unavailable");

    // The other two panels still rendered their real item.
    expect(screen.getAllByRole("link", { name: /Winter lookbook/ })).toHaveLength(2);
  });

  it("warns when a list may be incomplete because a board has no due date", async () => {
    respondWith((panel) =>
      panel === "overdue"
        ? { status: 200, body: payload("overdue", { boardsWithoutDueDate: 2 }) }
        : { status: 200, body: payload(panel as DailyListPanelId) },
    );

    render(<DailyListsSection />);

    await waitFor(() =>
      expect(panelEl("Overdue").textContent).toContain(
        "2 boards have no due-date field in this workspace",
      ),
    );
  });

  it("says when a list was cut short instead of presenting the cap as the total", async () => {
    respondWith((panel) =>
      panel === "overdue"
        ? {
            status: 200,
            body: payload("overdue", { items: [item()], truncated: true }),
          }
        : { status: 200, body: payload(panel as DailyListPanelId) },
    );

    render(<DailyListsSection />);

    await waitFor(() =>
      expect(panelEl("Overdue").textContent).toContain(
        "Showing the first 1 items",
      ),
    );
  });
});
