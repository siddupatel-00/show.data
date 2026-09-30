import { NextResponse } from "next/server";
import { getCurrentUser, User } from "./auth";
import { getSite, roleFor, Website, Role } from "./sites";

const ORDER: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export type SiteContext = { user: User; site: Website; role: Role };

export async function requireUser(): Promise<User | NextResponse> {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return user;
}

export async function requireSite(
  siteId: string,
  min: Role = "viewer",
): Promise<SiteContext | NextResponse> {
  const userP = requireUser();
  const siteP = getSite(siteId);
  const user = await userP;
  if (user instanceof NextResponse) return user;
  const site = await siteP;
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = await roleFor(site, user.id);
  if (!role || ORDER[role] < ORDER[min])
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return { user, site, role };
}

export function isResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}
