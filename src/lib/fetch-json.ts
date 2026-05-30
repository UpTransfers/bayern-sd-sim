type FetchJsonOptions = {
  timeoutMs?: number;
  headers?: Record<string, string>;
};

export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<{ data: T; status: number; ok: boolean; rawText: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "FC Bayern Sporting Director Simulator/1.0",
        Accept: "application/json",
        ...options.headers,
      },
      signal: controller.signal,
      cache: "no-store",
    });
    const rawText = await response.text();
    let data: T;

    try {
      data = JSON.parse(rawText) as T;
    } catch {
      data = rawText as T;
    }

    return { data, status: response.status, ok: response.ok, rawText };
  } finally {
    clearTimeout(timeout);
  }
}
