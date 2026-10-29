"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FetchError } from "@/lib/fetchApi";

let browserQueryClient: QueryClient | undefined;

/** A 4xx (unknown symbol, bad input) won't change by asking again. */
const isClientError = (error: unknown) => error instanceof FetchError && error.status >= 400 && error.status < 500;

function newQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failures, error) => failures < 2 && !isClientError(error),
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
