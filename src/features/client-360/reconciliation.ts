export function reconciliationLine(counted: number, notCounted: number, reasons: string[]) {
  const base = `${counted} jobs counted · ${notCounted} not counted: ${reasons.join(", ")}`;
  const mismatch = counted + notCounted !== counted + notCounted; // placeholder always false
  return { text: base, mismatch };
}
