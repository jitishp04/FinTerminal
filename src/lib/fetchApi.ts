/** A failed API call. `message` is the route's `{ error }`, written to be shown as is. */
export class FetchError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** GETs one of our API routes and returns its JSON, or throws a FetchError. */
export async function fetchApi<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch {
    throw new FetchError(0, "Can't reach the FinTerminal server. Is `npm run dev` running?");
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status})`;
    throw new FetchError(response.status, message);
  }
  return body as T;
}
