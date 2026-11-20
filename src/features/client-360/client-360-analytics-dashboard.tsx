import React, { useEffect, useState } from "react";
import { getClientAnalyticsAction } from "./actions";

export function Client360AnalyticsDashboard(props: { clientId?: string | null; clientName?: string; selectedBoardIds?: string[] | null }) {
  const clientId = props.clientId ?? null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!clientId) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getClientAnalyticsAction({ clientId, boardIds: props.selectedBoardIds })
      .then((result) => { if (!cancelled) { if (result.error) setError(result.error); else setData(result.data); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId, props.selectedBoardIds, retryKey]);

  if (!clientId) {
    return <div>Select a client to view their profile</div>;
  }

  if (error) {
    return (
      <div>
        <div>{error}</div>
        <button onClick={() => setRetryKey((value) => value + 1)}>Retry</button>
      </div>
    );
  }

  const k = data?.kpis;
  return (
    <div>
      <div>
        {loading ? <span aria-label="Loading analytics">Loading...</span> : null}
        <div>Total jobs: {k?.totalJobs ?? 0}</div>
        <div>In progress: {k?.inProgress ?? 0}</div>
        <div>Done: {k?.done ?? 0}</div>
        <div>Total SKUs: {k?.totalSkus ?? 0}</div>
        <div>Total images: {k?.totalImages ?? 0}</div>
        <div>Avg turnaround: {k?.avgTurnaroundDays ?? 0}</div>
        <div>Share of studio volume: {k?.shareOfStudioVolume ?? 0}</div>
      </div>
      {data && <div>Data as of {new Date().toLocaleString()} {data.excluded?.noReceivedDate ? `(${data.excluded.noReceivedDate} jobs have no received date)` : ""}</div>}
      {data && <div className="grid gap-3 md:grid-cols-2">
        <ChartCard title="Volume trend">{data.receivedVsCompletedByMonth.map((x: any) => <div key={x.month}>{x.month}: {x.received} received / {x.completed} completed</div>)}</ChartCard>
        <ChartCard title="Status breakdown">{data.statusBreakdown.map((x: any) => <div key={x.status}>{x.status}: {x.count}</div>)}</ChartCard>
        <ChartCard title="Job type mix">{data.jobTypeMix.map((x: any) => <div key={x.jobType}>{x.jobType}: {x.count}</div>)}</ChartCard>
        <ChartCard title="Jobs by board">{data.jobsByBoard.map((x: any) => <div key={x.boardId}>{x.boardName}: {x.volume}</div>)}</ChartCard>
        <ChartCard title="SKU count over time">{data.skuByMonth.map((x: any) => <div key={x.month}>{x.month}: {x.skus}</div>)}</ChartCard>
        <ChartCard title="Avg turnaround over time">{data.turnaroundByMonth.map((x: any) => <div key={x.month}>{x.month}: {x.avgDays.toFixed(1)} days</div>)}</ChartCard>
        <ChartCard title="Workload by owner">{data.workloadByOwner.map((x: any) => <div key={x.owner}>{x.owner}: {x.count}</div>)}</ChartCard>
        <ChartCard title="Recent jobs">{data.recentJobs.map((x: any) => <div key={`${x.board}-${x.name}`}>{x.name} — {x.board}</div>)}</ChartCard>
      </div>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border p-4"><h3 className="font-semibold">{title}</h3><div className="mt-2 text-sm text-muted-foreground">{children || "No data for this client in the selected boards"}</div></section>;
}

export default Client360AnalyticsDashboard;
