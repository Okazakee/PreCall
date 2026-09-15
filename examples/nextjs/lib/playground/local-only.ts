/**
 * Local-only request guard.
 *
 * The real network boundary is the loopback bind in this example's `dev` and `start` scripts
 * (`next dev|start --hostname 127.0.0.1`), so the workbench is not reachable from the network at
 * all. This header check is defense in depth for browser-shaped attacks that would still arrive
 * over loopback, such as a cross-origin request or DNS rebinding: it rejects a request whose
 * `Host` or `Origin` is not a genuine loopback name.
 *
 * It is not authentication, and it must not be treated as the boundary that protects the
 * credential: binding to loopback is.
 */

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostnameOf(value: string | null): string | null {
  if (value === null || value.trim().length === 0) return null;
  const trimmed = value.trim().toLowerCase();
  // IPv6 literals arrive as `[::1]:3000`; everything else as `host:port` or `host`.
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end === -1 ? null : trimmed.slice(0, end + 1);
  }
  const [host] = trimmed.split(":");
  return host ?? null;
}

function isLocalHostname(hostname: string | null): boolean {
  return hostname !== null && LOCAL_HOSTNAMES.has(hostname);
}

/** True when the request looks like a local browser call to the playground. */
export function isLocalRequest(request: Request): boolean {
  if (!isLocalHostname(hostnameOf(request.headers.get("host")))) return false;
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  if (origin === "null") return false;
  try {
    return isLocalHostname(hostnameOf(new URL(origin).host));
  } catch {
    return false;
  }
}

export function localOnlyRejection(): Response {
  return Response.json(
    {
      error:
        "The PreCall playground only serves localhost. It is local developer tooling with no authentication, so non-local requests are refused.",
      code: "not_local",
    },
    { status: 403 },
  );
}
