"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { isClientError, pollEvery } from "@/lib/fetchApi";

let browserQueryClient: QueryClient | undefined;

function newQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Polling does the retrying, so a failure shows at once and stays on screen between tries.
        retry: false,
        refetchInterval: pollEvery(false),
        refetchOnWindowFocus: (query) => !isClientError(query.state.error),
      },
    },
  });
}

function getQueryClient() {
  // Keep server renders isolated and reuse one client in the browser.
  if (typeof window === "undefined") return newQueryClient();
  browserQueryClient ??= newQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
