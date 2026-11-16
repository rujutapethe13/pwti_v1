import { afterEach, describe, expect, it, vi } from "vitest";

const ACCESS_TOKEN = "access-token-123";
const originalFetch = global.fetch;

vi.mock("@/lib/email/gmail/token-store", () => ({
  gmailTokenStore: {
    getAccessToken: () => Promise.resolve(ACCESS_TOKEN),
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch as any;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

function makeFetch() {
  const sent: { url: string; init: RequestInit }[] = [];
  global.fetch = vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: "message-id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as any;
  return sent;
}

async function setupSender() {
  process.env.GOOGLE_CLIENT_ID = "cid";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  return (await import("@/lib/email/gmail/sender")).gmailSender;
}

describe("gmail sender", () => {
  it("sends via Gmail API and returns success", async () => {
    const sender = await setupSender();
    const sent = makeFetch();

    const result = await sender.send({
      to: ["a@b.com"],
      subject: "Hello",
      html: "<p>Hi</p>",
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe("gmail");
    expect(result.id).toBe("message-id");
    expect(sent[0].url).toBe("https://gmail.googleapis.com/gmail/v1/me/messages/send");
    const headers = sent[0].init.headers as Record<string, string> | undefined;
    const auth = headers ? headers.Authorization ?? headers.authorization : undefined;
    expect(auth).toBe(`Bearer ${ACCESS_TOKEN}`);
    const body = JSON.parse((sent[0].init.body as string) ?? "{}");
    expect(typeof body.raw).toBe("string");
    const decoded = Buffer.from(body.raw, "base64url").toString("utf8");
    expect(decoded).toContain("To: a@b.com");
    expect(decoded).toContain("Subject: Hello");
    expect(decoded).toContain("<p>Hi</p>");
  });

  it("includes cc, bcc and reply-to headers", async () => {
    const sender = await setupSender();
    const sent = makeFetch();

    await sender.send({
      to: ["a@b.com"],
      cc: ["c@b.com"],
      bcc: ["d@b.com"],
      replyTo: ["reply@b.com"],
      subject: "Headers",
      html: "<p>Hi</p>",
    });

    const decoded = Buffer.from(
      JSON.parse((sent[0].init.body as string) ?? "{}").raw,
      "base64url",
    ).toString("utf8");
    expect(decoded).toContain("Cc: c@b.com");
    expect(decoded).toContain("Bcc: d@b.com");
    expect(decoded).toContain("Reply-To: reply@b.com");
  });

  it("retries on 429 and succeeds on retry", async () => {
    const sender = await setupSender();
    let calls = 0;
    global.fetch = vi.fn(async (): Promise<Response> => {
      calls += 1;
      if (calls === 1) {
        return new Response("too many", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return new Response(JSON.stringify({ id: "message-id-3" }), { status: 200 });
    }) as any;

    const result = await sender.send({
      to: ["a@b.com"],
      subject: "Hello",
      html: "<p>Hi</p>",
    });

    expect(result.success).toBe(true);
    expect(calls).toBe(2);
  });

  it("does not retry on 4xx validation error", async () => {
    const sender = await setupSender();
    let calls = 0;
    global.fetch = vi.fn(async (): Promise<Response> => {
      calls += 1;
      return new Response("bad request", { status: 400 });
    }) as any;

    const result = await sender.send({
      to: ["a@b.com"],
      subject: "Hello",
      html: "<p>Hi</p>",
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(calls).toBe(1);
  });
});
