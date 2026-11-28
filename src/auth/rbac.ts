// Role-based access control: each user has one role, each role has a fixed set of
// permissions, and code checks permissions, never role names. Adding a role later
// then means changing this table, not every route.
export const ROLES = ["viewer", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | "documents:read" // ask questions, use the agent, open sources, give feedback
  | "documents:write" // add documents (the agent can do it too, with approval)
  | "users:manage" // invite users and change roles
  | "usage:read"; // see costs and audit logs

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  viewer: ["documents:read"],
  editor: ["documents:read", "documents:write"],
  admin: ["documents:read", "documents:write", "users:manage", "usage:read"],
};

export const can = (role: Role, permission: Permission) =>
  ROLE_PERMISSIONS[role].includes(permission);

export const isRole = (value: unknown): value is Role =>
  ROLES.includes(value as Role);
