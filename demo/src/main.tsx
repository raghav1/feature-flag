import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { flagsQuery } from "./queries";
import { readSelection } from "./users";
import "./styles.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

/**
 * Flags are fetched before React renders anything, so the first paint already has the right
 * storefront: no default-then-flip flicker. If the backend is down we still render, with every flag OFF.
 */
async function start() {
  const root = document.getElementById("root");
  if (!root) throw new Error("#root element missing from index.html");

  const selection = readSelection(window.location.search);
  const startedAt = performance.now();
  // One attempt before first paint; useQuery retries in the background if this one fails.
  await queryClient.fetchQuery({ ...flagsQuery(selection), retry: false }).catch(() => undefined);
  const resolvedInMs = Math.round(performance.now() - startedAt);

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App initialSelection={selection} resolvedInMs={resolvedInMs} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void start();
