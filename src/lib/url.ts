import "server-only";
import { headers } from "next/headers";

export async function getAppOrigin(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) {
    try {
      return envUrl;
    } catch {
      /* fall through */
    }
  }

  try {
    const headersList = await headers();
    const host = headersList.get("host") ?? "localhost:3000";
    const protocol = headersList.get("x-forwarded-proto") ?? "http";
    return `${protocol}://${host}`;
  } catch {
    return "http://localhost:3000";
  }
}

export async function buildAbsoluteUrl(path: string): Promise<string> {
  return new URL(path, await getAppOrigin()).toString();
}
