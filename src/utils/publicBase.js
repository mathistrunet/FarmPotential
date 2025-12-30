export function withBasePath(path) {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  return `${normalizedBase}${normalizedPath}`;
}
