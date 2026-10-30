import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetchApi";
import type { Profile } from "@/lib/types";

const REFRESH = 10 * 60_000;

/** A security's profile. Panels showing one symbol share the request. */
export function useProfile(symbol: string) {
  return useQuery({
    queryKey: ["profile", symbol],
    queryFn: () => fetchApi<Profile>(`/api/profile?symbol=${encodeURIComponent(symbol)}`),
    refetchInterval: REFRESH,
    // Fresh until the next poll, so switching windows doesn't refetch it.
    staleTime: REFRESH,
  });
}
