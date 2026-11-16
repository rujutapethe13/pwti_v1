import { describe, expect, it } from "vitest";
import { resolveRecipients, type EmailEvent } from "@/lib/email/routing";

process.env.OWNER_EMAIL = "rujutapethe@gmail.com";
process.env.NOTIFY_EMAIL = "me@example.com";

describe("resolveRecipients", () => {
  it("routes access-request to OWNER_EMAIL", () => {
    const r = resolveRecipients("access-request");
    expect(r.to).toEqual(["rujutapethe@gmail.com"]);
  });

  it("routes access-approved/declined to the requester", () => {
    const ok = resolveRecipients("access-approved", { requesterEmail: "a@b.com" });
    expect(ok.to).toEqual(["a@b.com"]);

    const declined = resolveRecipients("access-declined", { requesterEmail: "a@b.com" });
    expect(declined.to).toEqual(["a@b.com"]);
  });

  it("throws when requesterEmail is missing for access decisions", () => {
    expect(() => resolveRecipients("access-approved")).toThrow();
    expect(() => resolveRecipients("access-declined")).toThrow();
  });

  it("routes password events to the user email", () => {
    const reset = resolveRecipients("password-reset", { userEmail: "user@x.com" });
    expect(reset.to).toEqual(["user@x.com"]);

    const changed = resolveRecipients("password-changed", { userEmail: "user@x.com" });
    expect(changed.to).toEqual(["user@x.com"]);
  });

  it("throws when userEmail is missing for password events", () => {
    expect(() => resolveRecipients("password-reset")).toThrow();
    expect(() => resolveRecipients("password-changed")).toThrow();
  });

  it("routes company-notification and trigger-test to NOTIFY_EMAIL", () => {
    expect(resolveRecipients("company-notification").to).toEqual(["me@example.com"]);
    expect(resolveRecipients("trigger-test").to).toEqual(["me@example.com"]);
  });

  it("routes job-pending to configured receivers", () => {
    const r = resolveRecipients("job-pending", {
      receivers: ["one@x.com", "two@x.com"],
    } as never);
    expect(r.to).toEqual(["one@x.com", "two@x.com"]);
  });

  it("job-pending throws when no receivers", () => {
    expect(() => resolveRecipients("job-pending", { receivers: [] } as never)).toThrow();
  });

  it("falls back to NOTIFY_EMAIL for an unknown event with customTo", () => {
    const r = resolveRecipients("unknown-event" as unknown as EmailEvent, {
      customTo: ["custom@x.com"],
    } as never);
    expect(r.to).toEqual(["custom@x.com"]);
  });
});
