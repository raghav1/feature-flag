import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { clientFor } from "./flags";
import { readSelection, sdkUser } from "./users";
import "@fontsource-variable/inter";
import "./styles.css";

/**
 * Flags are loaded before React renders anything, so the first paint already has the right storefront: no
 * default-then-flip flicker. load() never rejects; if the service is down the SDK serves cached results
 * (from an earlier visit) or nothing, and the page says so.
 */
async function start() {
  const root = document.getElementById("root");
  if (!root) throw new Error("#root element missing from index.html");

  const selection = readSelection(window.location.search);
  const startedAt = performance.now();
  await clientFor(selection.env).load(sdkUser(selection.user));
  const resolvedInMs = Math.round(performance.now() - startedAt);

  createRoot(root).render(
    <StrictMode>
      <App initialSelection={selection} resolvedInMs={resolvedInMs} />
    </StrictMode>,
  );
}

void start();
