"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getClientAnalyticsAction } from "./actions";
import type { ClientAnalytics } from "./client-analytics-service";
import { mapStatus } from "./status-mapping";

export interface NextBestActionItem {
  id: string;
  title: string;
  reason: string;
  jobs: Array<{ recordId: string; title: string; boardName: string; batchId: string }>;
}

interface Props {
  clientId?: string | null;
  clientName?: string;
  selectedBoardIds?: string[] | null;
  nextBestActions?: NextBestActionItem[];
}

const COLORS = ["#2F6B3F", "#4B54B5", "#B8456B", "#2A8C82", "#B7791F", "#C9C7BC"];

function Card({ title, description, empty, ariaLabel, children, footnotes }: {
  title: string; description: string; empty?: boolean; ariaLabel: string;
  children: React.ReactNode; footnotes?: React.ReactNode;
}) {
  return (
    <section aria-label={ariaLabel} className="min-h-[340px] rounded-[16px] border border-[#E3E1D8] bg-white p-[22px] text-[#1B1F1A] dark:border-white/10 dark:bg-zinc-950">
      <h3 className="text-[16px] font-semibold leading-5">{title}</h3>
      <p className="mt-1 min-h-[20px] text-[13px] text-[#5E6259]">{description}</p>
      <div className="mt-3 h-[230px]">
        {empty ? <div className="flex h-full items-center justify-center text-[13px] text-[#5E6259]">No data for this client in the selected boards</div> : children}
      </div>
      {footnotes && <div className="mt-2 text-[11px] text-[#5E6259]">{footnotes}</div>}
    </section>
  );
}

export function Client360AnalyticsDashboard(props: Props) {
  const clientId = props.clientId ?? null;
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<ClientAnalytics | null>(null);
  const [retryKey, setRetryKey] = React.useState(0);
  const [boardFilter, setBoardFilter] = React.useState<string[] | null>(props.selectedBoardIds ?? null);
  const [metric, setMetric] = React.useState<"jobs" | "skus">("jobs");
  const [tableFilter, setTableFilter] = React.useState<{ kind: "status" | "type" | "board" | "owner"; value: string } | null>(null);

  React.useEffect(() => { setBoardFilter(props.selectedBoardIds ?? null); }, [props.selectedBoardIds]);

  React.useEffect(() => {
    if (!clientId) { setData(null); setError(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    getClientAnalyticsAction({ clientId, boardIds: boardFilter })
      .then((result) => { if (!cancelled) { setData(result.error ? null : result.data); setError(result.error); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId, boardFilter, retryKey]);

  if (!clientId) return <div className="rounded-[16px] border border-[#E3E1D8] bg-white p-[22px] text-[#5E6259]">Select a client to view their profile</div>;

  if (loading && !data) return (
    <div aria-label="Loading analytics" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(min(100%,520px),1fr))]">
      {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-[340px] animate-pulse rounded-[16px] border border-[#E3E1D8] bg-white dark:bg-zinc-950" />)}
    </div>
  );
  if (error) return <div className="rounded-[16px] border border-[#E3E1D8] bg-white p-6"><p className="text-[#5E6259]">{error}</p><button className="mt-3 h-11 rounded-md bg-[#2F6B3F] px-4 text-white" onClick={() => setRetryKey((v) => v + 1)}>Retry</button></div>;

  const d = data ?? ({ kpis: { totalJobs: 0, inProgress: 0, done: 0, totalSkus: 0, totalImages: 0, avgTurnaroundDays: null, shareOfStudioVolume: 0 }, statusBreakdown: [], jobTypeMix: [], jobsByBoard: [], skuByMonth: [], receivedVsCompletedByMonth: [], turnaroundByMonth: [], studioAvgTurnaroundDays: null, workloadByOwner: [], recentJobs: [], excluded: { noReceivedDate: 0, noUploadDate: 0, brokenLinks: 0 } } as ClientAnalytics);
  const k = d.kpis;
  const statusTotal = d.statusBreakdown.reduce((n, x) => n + x.count, 0);
  const unknownStatusCount = d.statusBreakdown.find((x) => x.status === "Other")?.count ?? 0;
  const throughput = d.receivedVsCompletedByMonth.map((x) => ({ month: x.month, jobs: x.received, skus: d.skuByMonth.find((s) => s.month === x.month)?.skus ?? 0 }));
  const boardOptions = d.jobsByBoard;
  const filteredJobs = d.recentJobs.filter((j) => {
    if (!tableFilter) return true;
    if (tableFilter.kind === "status") return mapStatus(j.status) === tableFilter.value;
    if (tableFilter.kind === "type") return (j.jobType ?? "No value") === tableFilter.value;
    if (tableFilter.kind === "board") return j.board === tableFilter.value;
    return true;
  });

  return (
    <div className="space-y-5 bg-[#F6F5F1] dark:bg-zinc-950" style={{ "--accent": "#2F6B3F", "--muted": "#5E6259" } as React.CSSProperties}>
      <div className="flex flex-wrap gap-2" aria-label="Boards filter">
        <button className={`h-9 rounded-full border px-3 text-[13px] ${boardFilter === null ? "border-[#2F6B3F] bg-[#2F6B3F] text-white" : "border-[#E3E1D8] bg-white text-[#1B1F1A]"}`} onClick={() => setBoardFilter(null)}>All boards</button>
        {boardOptions.map((b) => (
          <button key={b.boardId} className={`h-9 rounded-full border px-3 text-[13px] ${boardFilter?.includes(b.boardId) ? "border-[#2F6B3F] bg-[#2F6B3F] text-white" : "border-[#E3E1D8] bg-white text-[#1B1F1A]"}`}
            onClick={() => setBoardFilter((prev) => prev === null ? [b.boardId] : prev.includes(b.boardId) ? (prev.filter((id) => id !== b.boardId).length ? prev.filter((id) => id !== b.boardId) : null) : [...prev, b.boardId])}>{b.boardName}</button>
        ))}
      </div>

      <div className="grid auto-cols-fr grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Client analytics KPIs">
        {[
          ["Total jobs", String(k.totalJobs), "All active jobs"],
          ["Done", String(k.done), `${k.totalJobs ? Math.round(k.done / k.totalJobs * 100) : 0}% of jobs`],
          ["In progress", String(k.inProgress), unknownStatusCount ? `${unknownStatusCount} job(s) have no status` : "Active work"],
          ["Total SKUs", String(k.totalSkus), "Processed assets"],
          ["Boards", String(d.jobsByBoard.length), "Contributing boards"],
          ["Avg turnaround", k.avgTurnaroundDays == null ? "—" : `${k.avgTurnaroundDays.toFixed(1)}d`, k.avgTurnaroundDays == null ? "Needs received + upload dates" : "Received to upload"],
        ].map(([label, value, subtitle]) => (
          <div key={label} className="min-h-[126px] rounded-[16px] border border-[#E3E1D8] bg-white p-[22px] dark:border-white/10 dark:bg-zinc-950">
            <div className="text-[11px] font-semibold uppercase text-[#5E6259]">{label}</div>
            <div className="mt-2 text-[40px] leading-none" style={{ fontFamily: "var(--font-dm-serif), Georgia, serif" }}>{value}</div>
            <div className="mt-2 text-[13px] text-[#5E6259]">{subtitle}</div>
          </div>
        ))}
      </div>

      <section className="rounded-[16px] border border-[#E3E1D8] bg-white p-[22px] dark:border-white/10 dark:bg-zinc-950">
        <h2 className="text-[16px] font-semibold">Next Best Actions</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {(props.nextBestActions ?? []).length ? props.nextBestActions!.map((action) => (
            <div key={action.id} className="rounded-lg border border-[#E3E1D8] p-3"><div className="text-[13px] font-semibold">{action.title}</div><div className="mt-1 text-[12px] text-[#5E6259]">{action.reason}</div></div>
          )) : <div className="col-span-full text-[13px] text-[#5E6259]">No next best actions.</div>}
        </div>
      </section>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 520px), 1fr))" }}>
        <Card title="Volume trend" description="Received vs completed jobs" ariaLabel={`Volume trend. Received and completed monthly values: ${d.receivedVsCompletedByMonth.map((x) => `${x.month} received ${x.received}, completed ${x.completed}`).join("; ")}`} empty={!d.receivedVsCompletedByMonth.length}
          footnotes={<>Received {d.receivedVsCompletedByMonth.reduce((n,x)=>n+x.received,0)}, completed {d.receivedVsCompletedByMonth.reduce((n,x)=>n+x.completed,0)}.</>}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={d.receivedVsCompletedByMonth}><CartesianGrid stroke="#E3E1D8" strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="received" stroke="#2F6B3F" strokeWidth={2} name="Received" /><Line type="monotone" dataKey="completed" stroke="#B7791F" strokeWidth={2} strokeDasharray="6 4" name="Completed" /></LineChart></ResponsiveContainer>
        </Card>

        <Card title="Monthly production throughput" description="Jobs or SKUs per month" ariaLabel={`Monthly production throughput. ${throughput.map((x)=>`${x.month} ${metric} ${x[metric]}`).join("; ")}`}>
          <div className="absolute">
            <button className={`h-9 rounded-l-md border px-3 ${metric==="jobs"?"bg-[#2F6B3F] text-white":"bg-white"}`} onClick={()=>setMetric("jobs")}>Jobs</button>
            <button className={`h-9 rounded-r-md border px-3 ${metric==="skus"?"bg-[#2F6B3F] text-white":"bg-white"}`} onClick={()=>setMetric("skus")}>SKUs</button>
          </div>
          <div className="h-full pt-10"><ResponsiveContainer width="100%" height="100%"><BarChart data={throughput}><CartesianGrid stroke="#E3E1D8" strokeDasharray="3 3" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey={metric} fill={metric==="jobs"?"#2F6B3F":"#4B54B5"} label={{ position:"top", fill:"#1B1F1A", fontSize:11 }} /></BarChart></ResponsiveContainer></div>
        </Card>

        <Card title="Status breakdown" description={`${statusTotal} jobs`} ariaLabel={`Status breakdown: ${d.statusBreakdown.map((x)=>`${x.status==="Other"?"No status":x.status} ${x.count}`).join("; ")}`} empty={!d.statusBreakdown.length}>
          <div className="flex h-full items-center"><div className="relative h-full w-[55%]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={d.statusBreakdown.map((x)=>({ ...x, status:x.status==="Other"?"No status":x.status }))} dataKey="count" nameKey="status" innerRadius={58} outerRadius={85} onClick={(slice: any)=>setTableFilter({kind:"status",value:slice.status==="No status"?"Other":String(slice.status)})}>{d.statusBreakdown.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[28px] font-semibold">{statusTotal}</div></div><div className="w-[45%] space-y-2">{d.statusBreakdown.map((x,i)=><div key={x.status} className="flex justify-between gap-2 text-[12px]"><span><i className="mr-2 inline-block size-2 rounded-full" style={{background:COLORS[i%COLORS.length]}} />{x.status==="Other"?"No status":x.status}</span><b>{x.count} · {statusTotal?Math.round(x.count/statusTotal*100):0}%</b></div>)}</div></div>
        </Card>

        <Card title="Job type mix" description="Distribution by job type" ariaLabel={`Job type mix: ${d.jobTypeMix.map((x)=>`${x.jobType||"No value"} ${x.count}`).join("; ")}`} empty={!d.jobTypeMix.length}>
          <div className="flex h-full items-center"><div className="h-full w-[55%]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={d.jobTypeMix} dataKey="count" nameKey="jobType" innerRadius={58} outerRadius={85} onClick={(slice: any)=>setTableFilter({kind:"type",value:String(slice.jobType)})}>{d.jobTypeMix.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><div className="w-[45%] space-y-2">{d.jobTypeMix.map((x,i)=><div key={x.jobType} className="flex justify-between gap-2 text-[12px]"><span><i className="mr-2 inline-block size-2 rounded-full" style={{background:COLORS[i%COLORS.length]}} />{x.jobType||"No value"}</span><b>{x.count}</b></div>)}</div></div>
        </Card>

        <Card title="Jobs by board" description={`The sum equals Total jobs (${k.totalJobs}).`} ariaLabel={`Jobs by board: ${d.jobsByBoard.map((x)=>`${x.boardName} ${x.volume}`).join("; ")}`} empty={!d.jobsByBoard.length}>
          <ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={d.jobsByBoard}><CartesianGrid stroke="#E3E1D8" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{fontSize:11}} /><YAxis type="category" dataKey="boardName" width={120} tick={{fontSize:11}} /><Tooltip /><Bar dataKey="volume" name="Jobs" fill="#2F6B3F" label={{position:"right",fill:"#1B1F1A",fontSize:11}} onClick={(slice)=>setTableFilter({kind:"board",value:String(slice.boardName)})} /></BarChart></ResponsiveContainer>
        </Card>

        <Card title="Avg turnaround by month" description="Client and studio average" ariaLabel={`Average turnaround by month: ${d.turnaroundByMonth.map((x)=>`${x.month} ${x.avgDays??"no data"} days`).join("; ")}; studio average ${d.studioAvgTurnaroundDays??"no data"} days`} empty={!d.turnaroundByMonth.length}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={d.turnaroundByMonth}><CartesianGrid stroke="#E3E1D8" strokeDasharray="3 3" /><XAxis dataKey="month" tick={{fontSize:11}} /><YAxis tick={{fontSize:11}} /><Tooltip /><Line type="monotone" dataKey="avgDays" connectNulls={false} stroke="#2F6B3F" strokeWidth={2} name={`Client ${d.turnaroundByMonth.at(-1)?.avgDays?.toFixed(1)??""}`} /><Line type="monotone" dataKey={() => d.studioAvgTurnaroundDays} stroke="#4B54B5" strokeDasharray="2 4" name={`Studio ${d.studioAvgTurnaroundDays?.toFixed(1)??"—"}d`} /></LineChart></ResponsiveContainer>
        </Card>

        <Card title="Workload by owner" description="Jobs by assigned owner" ariaLabel={`Workload by owner: ${d.workloadByOwner.map((x)=>`${x.owner||"Unassigned"} ${x.count}`).join("; ")}`} empty={!d.workloadByOwner.length}>
          <ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={d.workloadByOwner}><CartesianGrid stroke="#E3E1D8" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{fontSize:11}} /><YAxis type="category" dataKey="owner" width={120} tick={{fontSize:11}} /><Tooltip /><Bar dataKey="count" name="Jobs" fill="#4B54B5" label={{position:"right",fill:"#1B1F1A",fontSize:11}} /></BarChart></ResponsiveContainer>
        </Card>
      </div>

      <section className="rounded-[16px] border border-[#E3E1D8] bg-white p-[22px] dark:border-white/10 dark:bg-zinc-950">
        <div className="flex items-center justify-between"><div><h2 className="text-[16px] font-semibold">Recent jobs</h2><p className="mt-1 text-[13px] text-[#5E6259]">Latest 10 jobs</p></div><button className="h-11 rounded-md border border-[#E3E1D8] px-4 text-[13px]">View all jobs</button></div>
        {tableFilter && <button className="mt-3 h-9 rounded-full bg-[#E9F0EA] px-3 text-[13px] text-[#2F6B3F]" onClick={()=>setTableFilter(null)}>Clear filter: {tableFilter.value} ×</button>}
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-[13px]"><thead className="border-b border-[#E3E1D8] text-[11px] uppercase text-[#5E6259]"><tr><th className="py-3">Job</th><th>Board</th><th>Job type</th><th>Latest activity</th><th>Status</th></tr></thead><tbody>{filteredJobs.length ? filteredJobs.map((j,i)=><tr key={`${j.name}-${i}`} className="border-b border-[#E3E1D8]"><td className="py-3 font-medium">{j.name}</td><td>{j.board}</td><td>{j.jobType||"No value"}</td><td>{j.uploadDate||j.receivedDate||"—"}</td><td><span className="rounded-full bg-[#E9F0EA] px-2 py-1 text-[#2F6B3F]">{mapStatus(j.status)}</span></td></tr>) : <tr><td colSpan={5} className="py-8 text-center text-[#5E6259]">No data for this client in the selected boards</td></tr>}</tbody></table></div>
        {(d.excluded.noReceivedDate>0||d.excluded.noUploadDate>0)&&<div className="mt-3 text-[11px] text-[#5E6259]">{d.excluded.noReceivedDate>0&&<div>{d.excluded.noReceivedDate} jobs have no received date and are excluded</div>}{d.excluded.noUploadDate>0&&<div>{d.excluded.noUploadDate} jobs have no upload date and are excluded</div>}</div>}
      </section>
    </div>
  );
}

export default Client360AnalyticsDashboard;
