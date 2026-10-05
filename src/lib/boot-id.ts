/**
 * Server Boot ID
 *
 * A random identifier generated exactly once per server process. It changes only
 * when the server process is restarted (e.g. `next dev` / `next start` is stopped
 * and relaunched) — never on a client page refresh or an HMR update.
 *
 * Implementation note: Next.js dev-mode Hot Module Replacement re-evaluates
 * imported modules *without* a new process, so a plain `crypto.randomUUID()` at
 * module scope would regenerate on every HMR — falsely signalling a "restart".
 * Storing the ID on `globalThis` makes it survive HMR re-evaluation while still
 * being regenerated on a true process restart. Each fresh process gets a fresh
 * `globalThis`, so the ID is guaranteed to change only when the server is killed
 * and relaunched.
 *
 * This module is server-only and must NOT be imported by client components: doing
 * so would bundle a snapshot of the value into the client, defeating the
 * "regenerated on restart" guarantee. The client always obtains the live boot ID
 * via GET /api/boot-id instead.
 */
import "server-only";

const globalForBootId = globalThis as unknown as { __BOOT_ID?: string };

if (!globalForBootId.__BOOT_ID) {
  globalForBootId.__BOOT_ID = crypto.randomUUID();
}

const BOOT_ID: string = globalForBootId.__BOOT_ID;

export default BOOT_ID;
