import { createServiceClient } from '@/lib/supabase/server';
import type { StoredInboundEmail } from './resend';

const TABLE = 'inbound_emails';

export interface InboundEmailInput {
  resendId: string;
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  html: string | null;
  text: string | null;
  receivedAt: string;
  headers: Record<string, string>;
  attachments: StoredInboundEmail['attachments'];
}

export async function storeInboundEmail(input: InboundEmailInput): Promise<{
  id: string | null;
  duplicate: boolean;
  error: string | null;
}> {
  try {
    const supabase = await createServiceClient();

    const existing = await supabase
      .from(TABLE)
      .select('id')
      .eq('message_id', input.messageId)
      .maybeSingle();

    if (existing.error) {
      console.error('[inbound-storage] lookup failed:', existing.error.message);
      return { id: null, duplicate: false, error: existing.error.message };
    }

    if (existing.data) {
      return { id: existing.data.id as string, duplicate: true, error: null };
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        resend_id: input.resendId,
        message_id: input.messageId,
        from_address: input.from,
        to_addresses: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        received_at: input.receivedAt,
        headers: input.headers,
        attachments: input.attachments,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return { id: null, duplicate: true, error: null };
      }
      console.error('[inbound-storage] insert failed:', error.message);
      return { id: null, duplicate: false, error: error.message };
    }

    return { id: (data?.id as string) ?? null, duplicate: false, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[inbound-storage] unexpected:', message);
    return { id: null, duplicate: false, error: message };
  }
}
