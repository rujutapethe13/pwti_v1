import React, { useEffect, useState } from "react";
import { getClientAnalytics } from "./client-analytics-service";

export function Client360AnalyticsDashboard(props: any) {
  const clientId = props?.clientId ?? props?.client?.id ?? null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [selectedBoards, setSelectedBoards] = useState<string[] | null>(null);

  useEffect(() => {
    if (!clientId) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getClientAnalytics(clientId, selectedBoards, null)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(String(e?.message ?? e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId, selectedBoards]);

  if (!clientId) {
    return <div>Select a client to view their profile</div>;
  }

  if (error) {
    return (
      <div>
        <div>{error}</div>
        <button onClick={() => setSelectedBoards((b) => b)}>Retry</button>
      </div>
    );
  }

  const k = data?.kpis;
  return (
    <div>
      <div>
        <select multiple value={selectedBoards ?? []} onChange={(e) => {
          const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
          setSelectedBoards(vals.length ? vals : null);
        }}>
          <option value="">All boards</option>
        </select>
      </div>
      <div>
        {loading ? <span>skeleton</span> : null}
        <div>Total jobs: {k?.totalJobs ?? 0}</div>
        <div>In progress: {k?.inProgress ?? 0}</div>
        <div>Done: {k?.done ?? 0}</div>
        <div>Total SKUs: {k?.totalSkus ?? 0}</div>
        <div>Total images: {k?.totalImages ?? 0}</div>
        <div>Avg turnaround: {k?.avgTurnaroundDays ?? 0}</div>
        <div>Share of studio volume: {k?.shareOfStudioVolume ?? 0}</div>
      </div>
      {data ? (
        <div>Data as of {new Date().toISOString()} {data.excluded?.noReceivedDate ? `${data.excluded.noReceivedDate} jobs have no received date` : ""}</div>
      ) : null}
    </div>
  );
}

export default Client360AnalyticsDashboard;
