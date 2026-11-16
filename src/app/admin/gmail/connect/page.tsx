"use client";

import { useState } from "react";

/**
 * Admin-only Gmail connect page.
 *
 * Protected by middleware (/admin requires the admin role). Renders a form in
 * which the account owner enters ADMIN_SETUP_SECRET (second check) and clicks
 * "Connect Gmail" to start the Google OAuth connect flow (POST
 * /api/admin/gmail/connect -> Google login -> /api/admin/gmail/callback).
 */

export default function GmailConnectPage() {
  const [setupSecret, setSetupSecret] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("pending");
    setMessage("");

    try {
      const response = await fetch("/api/admin/gmail/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupSecret }),
      });

      if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
        const payload = await response.json();
        setStatus("error");
        setMessage(payload.error ?? "Connect failed");
        return;
      }

      if (response.redirected) {
        window.location.href = response.url;
        return;
      }

      setStatus("done");
      setMessage("Connect flow started.");
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message ?? String(err));
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: "48px auto", padding: 0, fontFamily: "system-ui, sans-serif" }}>
      <h2>Connect Gmail (Gmail API)</h2>
      <p>
        One-time admin setup. Sign in as the account owner, then enter the
        setup secret to start the Google OAuth connect flow. The refresh
        token is stored encrypted in the database.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <label>
          Setup secret (ADMIN_SETUP_SECRET)
          <input
            type="password"
            required
            value={setupSecret}
            onChange={(e) => setSetupSecret(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4, boxSizing: "border-box" }}
          />
        </label>
        <button
          type="submit"
          disabled={status === "pending"}
          style={{ padding: 8, cursor: status === "pending" ? "not-allowed" : "pointer" }}
        >
          {status === "pending" ? "Connecting…" : "Connect Gmail account"}
        </button>
      </form>

      {status === "done" && (
        <p style={{ color: "#10b981", marginTop: 12 }}>{message}</p>
      )}
      {status === "error" && (
        <p style={{ color: "#ef4444", marginTop: 12 }}>{message}</p>
      )}

      <p style={{ marginTop: 24, fontSize: 12, color: "#666" }}>
        Requires EMAIL_PROVIDER=gmail, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
        GMAIL_SENDER, EMAIL_ENCRYPTION_KEY, and ADMIN_SETUP_SECRET to be
        configured in Vercel. The Google Cloud OAuth redirect URI must include
        /api/admin/gmail/callback (registered:
        http://localhost:3000/api/admin/gmail/callback).
      </p>
    </div>
  );
}
