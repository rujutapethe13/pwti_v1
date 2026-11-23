import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { OWNER_EMAIL } from "@/lib/board-access";
import { isValidEmail, normalizeEmail } from "./predicate";
import type { AlertCandidate } from "./types";

/**
 * Recipient resolution for digest alerts.
 *
 * For each alert candidate the recipients are:
 *   1. Board admins — `board_admins` rows (role owner/admin) for the board's
 *      workspace, plus the configured workspace owner (OWNER_EMAIL).
 *   2. Workspace / super admins — `organization_members` rows with role 'admin'
 *      in the candidate's organization.
 *   3. The job's assignee(s) — person cells store auth user ids; a ref that is
 *      already an email is used directly.
 *
 * Rules (per the spec):
 *   - De-duplicate by normalized email address.
 *   - Skip users without a valid email, logging a warning. Never invent one.
 *   - A missing recipient is logged; resolution never throws.
 */

const ADMIN_ROLES = ["owner", "admin"] as const;

export interface ResolvedRecipients {
  emails: string[];
  warnings: string[];
}

interface UserEmailRow {
  id: string;
  email: string | null;
}

export class RecipientResolver {
  private readonly supabase: SupabaseClient;
  private readonly emailByUserId = new Map<string, string | null>();
  private readonly adminUserIdsByWorkspace = new Map<string, Set<string>>();
  private readonly orgAdminUserIds: Set<string> | null;
  private readonly warnings: string[] = [];

  private constructor(supabase: SupabaseClient, orgAdminUserIds: Set<string> | null) {
    this.supabase = supabase;
    this.orgAdminUserIds = orgAdminUserIds;
  }

  static async create(organizationId: string): Promise<RecipientResolver> {
    const supabase = await createServiceClient();
    const orgAdmins = await RecipientResolver.loadOrgAdminUserIds(supabase, organizationId);
    return new RecipientResolver(supabase, orgAdmins);
  }

  /** organization_members admins for the org. Missing table is tolerated. */
  private static async loadOrgAdminUserIds(
    supabase: SupabaseClient,
    organizationId: string,
  ): Promise<Set<string> | null> {
    try {
      const { data, error } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("role", "admin");
      if (error) {
        console.warn("[email-alerts] organization_members lookup failed:", error.message);
        return null;
      }
      return new Set((data ?? []).map((r) => r.user_id as string));
    } catch (err) {
      console.warn("[email-alerts] organization_members lookup threw:", err);
      return null;
    }
  }

  /** Board admin user ids (owner/admin rows) for one workspace, cached. */
  private async adminUserIdsForWorkspace(workspaceId: string): Promise<Set<string>> {
    const cached = this.adminUserIdsByWorkspace.get(workspaceId);
    if (cached) return cached;
    const ids = new Set<string>();
    try {
      const { data, error } = await this.supabase
        .from("board_admins")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .in("role", [...ADMIN_ROLES]);
      if (error) {
        this.warnings.push(`board_admins lookup failed for workspace ${workspaceId}: ${error.message}`);
      } else {
        for (const row of data ?? []) ids.add(row.user_id as string);
      }
    } catch (err) {
      this.warnings.push(`board_admins lookup threw for workspace ${workspaceId}: ${String(err)}`);
    }
    this.adminUserIdsByWorkspace.set(workspaceId, ids);
    return ids;
  }

  /** Resolve a user id to an email via auth.users, then profiles. Cached. */
  private async emailForUserId(userId: string): Promise<string | null> {
    if (this.emailByUserId.has(userId)) return this.emailByUserId.get(userId) ?? null;
    let email: string | null = null;
    try {
      const { data } = await this.supabase
        .from("auth.users")
        .select("id, email")
        .eq("id", userId)
        .maybeSingle();
      if (data?.email) {
        email = (data as UserEmailRow).email;
      } else {
        const { data: profile } = await this.supabase
          .from("profiles")
          .select("id, email")
          .eq("id", userId)
          .maybeSingle();
        if (profile?.email) email = (profile as UserEmailRow).email;
      }
    } catch (err) {
      this.warnings.push(`user lookup failed for ${userId}: ${String(err)}`);
    }
    this.emailByUserId.set(userId, email);
    if (!email) {
      this.warnings.push(`no email address found for user ${userId} — skipped`);
    }
    return email;
  }

  /** Collect the de-duplicated recipient emails for one candidate. */
  async forCandidate(candidate: AlertCandidate): Promise<ResolvedRecipients> {
    const warnStart = this.warnings.length;
    const userIds = new Set<string>();

    for (const id of await this.adminUserIdsForWorkspace(candidate.workspaceId)) {
      userIds.add(id);
    }
    for (const ref of candidate.assigneeRefs) {
      userIds.add(ref);
    }
    if (this.orgAdminUserIds) {
      for (const id of this.orgAdminUserIds) userIds.add(id);
    }

    const emails = new Map<string, string>();
    for (const userId of userIds) {
      // A ref that is already an email is used as-is (never invented).
      if (isValidEmail(userId)) {
        emails.set(normalizeEmail(userId), userId.trim());
        continue;
      }
      const email = await this.emailForUserId(userId);
      if (email && isValidEmail(email)) {
        emails.set(normalizeEmail(email), email.trim());
      } else if (email) {
        this.warnings.push(`invalid email "${email}" for user ${userId} — skipped`);
      }
    }

    // The workspace/super admin is always a recipient when configured.
    if (isValidEmail(OWNER_EMAIL)) {
      emails.set(normalizeEmail(OWNER_EMAIL), OWNER_EMAIL);
    }

    return { emails: [...emails.values()], warnings: this.warnings.slice(warnStart) };
  }
}