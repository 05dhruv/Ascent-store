// Keep browser requests on this Next.js application unless a separate auth
// backend has been deliberately configured.  NEXT_PUBLIC_BACKEND_URL is also
// used by sibling local projects, so using it as an automatic 404 fallback can
// mix applications and turn a local API error into an unrelated HTML response.
const BACKEND_URL =
  process.env.NEXT_PUBLIC_ENABLE_AUTH_API_FALLBACK === "true"
    ? process.env.NEXT_PUBLIC_AUTH_BACKEND_URL || ""
    : "";
const BACKEND_TIMEOUT_MS = 4000;

function normalizePath(path) {
  return path.startsWith("/") ? path : `/${path}`;
}

function buildUrl(base, path) {
  const normalizedPath = normalizePath(path);
  if (!base) return normalizedPath;
  return `${base.replace(/\/$/, "")}${normalizedPath}`;
}

async function fetchAuthResponse(url, options) {
  return fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
  });
}

async function fetchBackendAuthResponse(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);

  try {
    return await fetchAuthResponse(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchAuthEndpoint(path, options = {}) {
  const normalizedPath = normalizePath(path);

  const localResponse = await fetchAuthResponse(normalizedPath, options);
  if (localResponse.status !== 404) {
    return localResponse;
  }

  if (!BACKEND_URL) {
    return localResponse;
  }

  try {
    const backendResponse = await fetchBackendAuthResponse(
      buildUrl(BACKEND_URL, normalizedPath),
      options,
    );
    const backendContentType =
      backendResponse.headers.get("content-type") || "";

    if (
      backendResponse.status === 404 &&
      !backendContentType.includes("application/json")
    ) {
      return localResponse;
    }

    return backendResponse;
  } catch {
    return localResponse;
  }
}
