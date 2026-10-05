import "server-only";

export function getDevAutoLoginCredentials() {
  if (process.env.NODE_ENV !== "development" || process.env.DEV_AUTO_LOGIN !== "true") {
    return null;
  }

  const email = process.env.DEV_AUTO_LOGIN_EMAIL;
  const password = process.env.DEV_AUTO_LOGIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "DEV_AUTO_LOGIN is enabled but DEV_AUTO_LOGIN_EMAIL or DEV_AUTO_LOGIN_PASSWORD is not set.",
    );
  }

  return { email, password };
}
