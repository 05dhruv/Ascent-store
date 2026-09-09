const DEFAULT_ECOMMERCE_TIMEOUT_MS = 8000;

function integrationConfig() {
  const configuredBaseUrl = String(
    process.env.ECOMMERCE_API_BASE_URL || "",
  ).trim();
  const key = process.env.ECOMMERCE_INTEGRATION_KEY || "";
  if (!configuredBaseUrl || key.length < 24) {
    throw new Error("Ecommerce integration is not configured");
  }
  const urlValue = /^https?:\/\//i.test(configuredBaseUrl)
    ? configuredBaseUrl
    : `https://${configuredBaseUrl}`;
  let baseUrl;
  try {
    const parsedUrl = new URL(urlValue);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
    baseUrl = parsedUrl.toString().replace(/\/$/, "");
  } catch {
    throw new Error("ECOMMERCE_API_BASE_URL must be a valid HTTP(S) URL");
  }
  return { baseUrl, key };
}

function ecommerceTimeoutMs() {
  const configuredTimeout = Number(process.env.ECOMMERCE_TIMEOUT_MS);
  return Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_ECOMMERCE_TIMEOUT_MS;
}

function createRequestControl(externalSignal, timeoutMs) {
  const controller = new AbortController();
  let didTimeout = false;

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  const abortFromExternal = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromExternal();
    } else {
      externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    cleanup: () => {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener?.("abort", abortFromExternal);
    },
  };
}

export async function callEcommerce(path, options = {}) {
  const config = integrationConfig();
  const { headers, signal, ...fetchOptions } = options;
  const requestControl = createRequestControl(signal, ecommerceTimeoutMs());
  let response;
  let payload;

  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...fetchOptions,
      cache: "no-store",
      signal: requestControl.signal,
      headers: {
        "content-type": "application/json",
        "x-tbm-integration-key": config.key,
        ...(headers || {}),
      },
    });
    payload = await response.json().catch(() => ({}));
  } catch (err) {
    if (requestControl.didTimeout()) {
      const error = new Error("Ecommerce service timed out");
      error.status = 504;
      throw error;
    }
    throw err;
  } finally {
    requestControl.cleanup();
  }

  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || "Ecommerce request failed");
    error.status = response.status;
    throw error;
  }
  return payload.data || payload;
}
