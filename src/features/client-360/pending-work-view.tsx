"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  X,
  AlertTriangle,
  Building2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { fetchClient360PendingWorkAction, getClient360ResolvedClientsAction } from "./actions";
import type {
  Client360PendingWorkResult,
  Client360PendingItem,
  PendingDateField,
  Client360ResolvedClient,
} from "./types";
import { formatDate, getTodayISO, getWeekAgoISO } from "./date-format";

const PAGE_SIZE = 50;

const DATE_FIELD_OPTIONS: { value: PendingDateField; label: string; icon: React.ReactNode }[] = [
  { value: "any", label: "Any date", icon: <CalendarDays className="h-4 w-4" /> },
  { value: "job_date", label: "Received date", icon: <Calendar className="h-4 w-4" /> },
  { value: "due_date", label: "Due date", icon: <Clock className="h-4 w-4" /> },
];

type Mode = "day" | "range";

export function Client360PendingWorkView() {
  const [dateField, setDateField] = useState<PendingDateField>("any");
  const [dateMode, setDateMode] = useState<Mode>("day");
  const [selectedDate, setSelectedDate] = useState<string>(getTodayISO());
  const [dateRangeStart, setDateRangeStart] = useState<string>(getWeekAgoISO());
  const [dateRangeEnd, setDateRangeEnd] = useState<string>(getTodayISO());

  const [selectedClient, setSelectedClient] = useState<Client360ResolvedClient | null>(null);
  const [clientInputValue, setClientInputValue] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [resolvedClients, setResolvedClients] = useState<Client360ResolvedClient[]>([]);
  const [clientSearchText, setClientSearchText] = useState("");

  const [result, setResult] = useState<Client360PendingWorkResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const clientsLoadedRef = useRef(false);

  useEffect(() => {
    if (clientsLoadedRef.current) return;
    clientsLoadedRef.current = true;
    void getClient360ResolvedClientsAction().then((res) => {
      if (res.error) {
        toast.error(res.error);
      } else if (res.data) {
        setResolvedClients(res.data);
      }
    });
  }, []);

  const filterParams = useMemo(() => {
    const base: {
      date_field?: string;
      page_size: number;
      start?: string;
      end?: string;
      client_id?: string;
      client_search?: string;
    } = {
      page_size: PAGE_SIZE,
    };

    if (dateField !== "any") {
      base.date_field = dateField;
    }

    if (dateField !== "any") {
      if (dateMode === "day") {
        base.start = selectedDate;
        base.end = selectedDate;
      } else {
        base.start = dateRangeStart;
        base.end = dateRangeEnd;
      }
    }

    if (selectedClient) {
      base.client_id = selectedClient.id;
    } else if (clientSearchText.trim()) {
      base.client_search = clientSearchText.trim();
    }

    return base;
  }, [dateField, dateMode, selectedDate, dateRangeStart, dateRangeEnd, selectedClient, clientSearchText]);

  const fetchPendingWork = useCallback(
    async (pageNum = 1) => {
      setLoading(true);
      try {
        const res = await fetchClient360PendingWorkAction({
          ...filterParams,
          page: pageNum,
        });
        if (res.error) {
          toast.error(res.error);
        } else if (res.data) {
          setResult(res.data);
        }
      } catch {
        toast.error("Failed to load pending work");
      } finally {
        setLoading(false);
      }
    },
    [filterParams],
  );

  const fetchPendingWorkRef = useRef(fetchPendingWork);
  fetchPendingWorkRef.current = fetchPendingWork;

  useEffect(() => {
    setPage(1);
    void fetchPendingWorkRef.current(1);
  }, [dateField, dateMode, selectedDate, dateRangeStart, dateRangeEnd, selectedClient, clientSearchText]);

  const filteredClients = useMemo(() => {
    if (!clientInputValue.trim()) return resolvedClients;
    const lower = clientInputValue.toLowerCase();
    return resolvedClients.filter(
      (c) =>
        c.canonical_name.toLowerCase().includes(lower) ||
        c.aliases.some((a) => a.toLowerCase().includes(lower)),
    );
  }, [clientInputValue, resolvedClients]);

  const matchedClient = useMemo<Client360ResolvedClient | null>(() => {
    if (!clientInputValue.trim()) return null;
    const lower = clientInputValue.toLowerCase();
    const byName = resolvedClients.find((c) => c.canonical_name.toLowerCase() === lower);
    if (byName) return byName;
    return (
      resolvedClients.find((c) => c.aliases.some((a) => a.toLowerCase() === lower)) ?? null
    );
  }, [clientInputValue, resolvedClients]);

  const handleClientInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setClientInputValue(val);
    if (selectedClient && val !== selectedClient.canonical_name) {
      setSelectedClient(null);
    }
    if (clientSearchText && val !== clientSearchText) {
      setClientSearchText("");
    }
  };

  const handleClientInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setClientDropdownOpen(false);
      if (matchedClient) {
        setSelectedClient(matchedClient);
        setClientInputValue(matchedClient.canonical_name);
      } else if (clientInputValue.trim()) {
        setClientSearchText(clientInputValue.trim());
      }
    }
    if (e.key === "Escape") {
      setClientDropdownOpen(false);
    }
  };

  const handleClientInputBlur = () => {
    setTimeout(() => setClientDropdownOpen(false), 200);
  };

  const selectClient = (client: Client360ResolvedClient) => {
    setSelectedClient(client);
    setClientInputValue(client.canonical_name);
    setClientSearchText("");
    setClientDropdownOpen(false);
  };

  const clearClient = () => {
    setSelectedClient(null);
    setClientInputValue("");
    setClientSearchText("");
  };

  const handleDateFieldChange = (field: PendingDateField) => {
    setDateField(field);
  };

  const handleModeChange = (mode: Mode) => {
    setDateMode(mode);
  };

  const handleRefresh = () => {
    void fetchPendingWorkRef.current(page);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    void fetchPendingWorkRef.current(newPage);
  };

  const showDateControls = dateField !== "any";
  const clientDisplay = selectedClient
    ? selectedClient.canonical_name
    : clientInputValue;
  const showClearClient = selectedClient || clientSearchText;

  const getClientGroupKey = (item: Client360PendingItem): string => {
    return item.client_id || item.client_name;
  };

  const TABLE_COLUMNS = "1.5fr 1fr 1fr 1fr 1.5fr";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {DATE_FIELD_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant={dateField === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => handleDateFieldChange(opt.value)}
            >
              {opt.icon}
              {opt.label}
            </Button>
          ))}
        </div>

        {showDateControls && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant={dateMode === "day" ? "default" : "outline"}
                size="sm"
                onClick={() => handleModeChange("day")}
              >
                <Calendar className="mr-2 h-4 w-4" />
                Single day
              </Button>
              <Button
                type="button"
                variant={dateMode === "range" ? "default" : "outline"}
                size="sm"
                onClick={() => handleModeChange("range")}
              >
                <Clock className="mr-2 h-4 w-4" />
                Date range
              </Button>
            </div>

            {dateMode === "day" ? (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border-border bg-background rounded-md border px-3 py-1.5 text-sm"
              />
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateRangeStart}
                  onChange={(e) => setDateRangeStart(e.target.value)}
                  className="border-border bg-background rounded-md border px-3 py-1.5 text-sm"
                />
                <span className="text-muted-foreground text-xs">to</span>
                <input
                  type="date"
                  value={dateRangeEnd}
                  onChange={(e) => setDateRangeEnd(e.target.value)}
                  className="border-border bg-background rounded-md border px-3 py-1.5 text-sm"
                />
              </div>
            )}
          </div>
        )}

        <div className="relative w-64">
          <Input
            value={clientDisplay}
            onChange={handleClientInputChange}
            onFocus={() => setClientDropdownOpen(true)}
            onKeyDown={handleClientInputKeyDown}
            onBlur={handleClientInputBlur}
            placeholder="All clients"
            className={cn("pr-8", selectedClient && "bg-accent/10")}
          />
          {showClearClient && (
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 hover:bg-accent rounded"
              onClick={clearClient}
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
          {clientDropdownOpen && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
              <button
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-accent",
                  !selectedClient && !clientSearchText && "bg-accent/50",
                )}
                onClick={() => {
                  clearClient();
                  setClientDropdownOpen(false);
                }}
              >
                All clients
              </button>
              {filteredClients.length === 0 && clientInputValue.trim() && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No matching clients. Type to search as free text.
                </div>
              )}
              {filteredClients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => selectClient(c)}
                >
                  <div className="font-medium">{c.canonical_name}</div>
                  {c.aliases.length > 0 && (
                    <div className="text-xs text-muted-foreground truncate">
                      also: {c.aliases.join(", ")}
                    </div>
                  )}
                  {c.needs_confirmation && (
                    <div className="text-xs text-amber-600">Needs confirmation</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {result && result.total_pending > 0 && (
        <p className="text-sm text-muted-foreground">
          {result.total_pending} pending job{result.total_pending !== 1 ? "s" : ""} across{" "}
          {result.clients_active} client{result.clients_active !== 1 ? "s" : ""},{" "}
          {result.boards_touched} board{result.boards_touched !== 1 ? "s" : ""}
        </p>
      )}

      {result && result.unmapped_boards > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {result.unmapped_boards} board{result.unmapped_boards !== 1 ? "s" : ""}
            {" aren't included in these numbers yet — job date not configured"}
          </span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {result && result.total_pending === 0 && !loading && (
        <Card className="p-8 text-center">
          <CalendarDays className="mx-auto size-10 text-muted-foreground/40 mb-3" />
          <h3 className="text-base font-medium">No pending work found for this filter</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Try adjusting the date range, client filter, or refreshing.
          </p>
        </Card>
      )}

      {result && result.total_pending > 0 && !loading && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-auto">
            <div
              className="min-w-max"
              style={{
                display: "grid",
                gridTemplateColumns: TABLE_COLUMNS,
              }}
            >
              <div className="sticky top-0 z-30 border-b border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground">
                Item
              </div>
              <div className="sticky top-0 z-30 border-b border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground">
                Status
              </div>
              <div className="sticky top-0 z-30 border-b border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground">
                Job Date
              </div>
              <div className="sticky top-0 z-30 border-b border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground">
                Due Date
              </div>
              <div className="sticky top-0 z-30 border-b border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground">
                Assigned To
              </div>

              {result.results.map((item, idx) => {
                const prevItem = idx > 0 ? result.results[idx - 1] : null;
                const isFirstInGroup =
                  !prevItem || getClientGroupKey(item) !== getClientGroupKey(prevItem);
                return (
                  <Fragment key={`${item.record_id}-${item.board_id}-${idx}`}>
                    {isFirstInGroup && (
                      <div
                        className="border-b border-border bg-muted/30 px-3 py-2 text-sm font-medium"
                        style={{ gridColumn: "1 / -1" }}
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {item.client_name}
                        </div>
                      </div>
                    )}
                    <div className="border-b border-border px-3 py-2 text-sm truncate">
                      {item.item_name}
                    </div>
                    <div className="border-b border-border px-3 py-2 text-sm">
                      <Badge variant="secondary" className="text-xs">
                        {item.status || "Unspecified"}
                      </Badge>
                    </div>
                    <div className="border-b border-border px-3 py-2 text-sm text-muted-foreground">
                      {formatDate(item.job_date) || "—"}
                    </div>
                    <div className="border-b border-border px-3 py-2 text-sm text-muted-foreground">
                      {formatDate(item.due_date) || "—"}
                    </div>
                    <div className="border-b border-border px-3 py-2 text-sm text-muted-foreground">
                      {item.assigned_to.length > 0 ? item.assigned_to.join(", ") : "—"}
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {result && result.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {result.page} of {result.total_pages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm px-2">{page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= result.total_pages}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
