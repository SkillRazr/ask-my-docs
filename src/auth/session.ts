import { jwtVerify, SignJWT } from "jose";
import { isRole, type Role } from "./rbac";

// The signed-in user, as every route sees it.
export interface User {
  id: string;
  email: string;
  tenantId: string;
  role: Role;
}

// Your own session token: a JWT signed with AUTH_SECRET, kept in an HttpOnly cookie.
// Google proves who someone is once, at sign-in. After that, this token says who they
// are on every request, without a database lookup.
const secret = () => {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32)
    throw new Error("Set AUTH_SECRET in .env to at least 32 random characters");
  return new TextEncoder().encode(value);
};

export const SESSION_COOKIE = "session";
export const SESSION_HOURS = 8;

export async function signSession(user: User) {
  return new SignJWT({
    email: user.email,
    tenant: user.tenantId,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

// Returns the user, or null for a missing, expired, tampered or malformed token.
export async function verifySession(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"], // never accept a token that names its own algorithm
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.tenant !== "string" ||
      !isRole(payload.role)
    )
      return null;
    return {
      id: payload.sub,
      email: payload.email,
      tenantId: payload.tenant,
      role: payload.role,
    };
  } catch {
    return null;
  }
}
