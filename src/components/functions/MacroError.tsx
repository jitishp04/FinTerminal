import { FetchError } from "@/lib/fetchApi";
import { SourceError } from "./SourceError";

const KEY_SIGNUP = "https://fredaccount.stlouisfed.org/apikeys";

/** Why a macro panel has no data. A problem with the key comes with where to get one. */
export function MacroError({ error }: { error: Error }) {
  if (error instanceof FetchError && error.status === 401) {
    return (
      <p role="status" className="text-muted">
        {error.message}{" "}
        <a href={KEY_SIGNUP} target="_blank" rel="noreferrer" className="text-link hover:underline">
          Get a free key
        </a>
      </p>
    );
  }
  return <SourceError error={error} />;
}
