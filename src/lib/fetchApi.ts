/** A failed API call. `message` is the route's `{ error }`, written to be shown as is. */
export class FetchError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** A 4xx (unknown symbol, bad input) won't change by asking again. */
export const isClientError = (error: unknown) => error instanceof FetchError && error.status >= 400 && error.status < 500;

const RETRY_EVERY = 10_000;

/** For a query's `refetchInterval`: every `interval`, and sooner after a failure, since the panel says it's retrying. */
export const pollEvery =
  (interval: number | false) =>
  ({ state }: { state: { error: Error | null } }) =>
    state.error && !isClientError(state.error) ? RETRY_EVERY : interval;

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
