export interface ClientJobRow {
  recordId: string;
  clientName: string;
  isPractice?: boolean;
  isArchived?: boolean;
  linkedCopyOf?: string;
}

export interface GetClientJobsOptions {
  aliases?: string[];
  includePractice?: boolean;
  includeArchived?: boolean;
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function getClientJobs(clientName: string, rows: ClientJobRow[], options: GetClientJobsOptions = {}): ClientJobRow[] {
  const aliases = [clientName, ...(options.aliases ?? [])].map(normalizeName);
  const seen = new Set<string>();
  const result: ClientJobRow[] = [];
  for (const row of rows) {
    if (!options.includePractice && row.isPractice) continue;
    if (!options.includeArchived && row.isArchived) continue;
    if (!aliases.includes(normalizeName(row.clientName))) continue;
    if (seen.has(row.recordId)) continue;
    if (row.linkedCopyOf && seen.has(row.linkedCopyOf)) continue;
    seen.add(row.recordId);
    result.push(row);
  }
  return result;
}
