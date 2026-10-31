import { FetchError } from "@/lib/fetchApi";

/** Why a panel has no data. "Not available" is an answer, not a failure, so it doesn't read as an alarm. */
export function SourceError({ error, notAvailable }: { error: Error; notAvailable?: string }) {
  if (error instanceof FetchError && error.status === 404) {
    return (
      <p role="status" className="text-muted">
        {notAvailable ?? error.message}
      </p>
    );
  }
  return (
    <p role="alert" className="text-down">
      {error.message}
    </p>
  );
}
