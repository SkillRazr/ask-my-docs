import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Sign in with Google, using OpenID Connect (OAuth 2.0 plus an ID token that says
// who the user is). The flow: send the user to Google, Google sends them back with a
// one-time code, the server swaps the code for an ID token and checks its signature.
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_KEYS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

const config = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return { clientId, clientSecret, redirectUri: `${appUrl}/auth/callback` };
};

export const googleEnabled = () => config() !== null;

const random = () => randomBytes(32).toString("base64url");

// Step 1: where to send the user. state stops another site from finishing a sign-in
// in your browser (CSRF), nonce ties the ID token to this sign-in, and the PKCE
// verifier means a stolen code is useless without it. The caller keeps all three
// in a short-lived cookie until Google sends the user back.
export function startSignIn() {
  const google = config();
  if (!google) throw new Error("Google sign-in isn't configured");
  const flow = { state: random(), nonce: random(), verifier: random() };
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: google.clientId,
    redirect_uri: google.redirectUri,
    response_type: "code",
    scope: "openid email",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash("sha256")
      .update(flow.verifier)
      .digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), flow };
}

// Step 2: Google sent the user back with a code. Swap it for an ID token, check the
// token really comes from Google, is meant for this app and this sign-in, and
// return the verified email address.
export async function finishSignIn(
  code: string,
  flow: { nonce: string; verifier: string }
) {
  const google = config();
  if (!google) throw new Error("Google sign-in isn't configured");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: google.redirectUri,
      grant_type: "authorization_code",
      code_verifier: flow.verifier,
    }),
  });
  if (!response.ok)
    throw new Error(`Google token exchange failed: ${response.status}`);
  const { id_token } = (await response.json()) as { id_token?: string };
  if (!id_token) throw new Error("Google didn't return an ID token");

  const { payload } = await jwtVerify(id_token, GOOGLE_KEYS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: google.clientId,
  });
  if (payload.nonce !== flow.nonce) throw new Error("The sign-in didn't match");
  if (payload.email_verified !== true || typeof payload.email !== "string")
    throw new Error("Google didn't confirm this email address");
  return payload.email;
}
