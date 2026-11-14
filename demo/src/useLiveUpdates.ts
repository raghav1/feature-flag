import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { changeStreamUrl, type Env } from "./api";

export type LiveStatus = "connecting" | "live" | "reconnecting";

const MAX_BACKOFF_MS = 30_000;

/**
 * Listens for "changed" events on the environment's stream and refetches its flags. The refetch keeps the
 * current view until the new results arrive, so updates swap in without flicker.
 *
 * Reconnecting: EventSource retries network errors itself, but an HTTP error (nginx's 502 while the backend
 * is down) closes it for good, so we reopen it ourselves with backoff. Events sent while disconnected are
 * lost, so every reconnect ("ready" after the first) refetches to catch up.
 */
export function useLiveUpdates(env: Env): LiveStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");

  useEffect(() => {
    const refetch = () => void queryClient.invalidateQueries({ queryKey: ["flags", env] });
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let backoffMs = 1000;
    let connectedBefore = false;
    let stopped = false;

    const connect = () => {
      source = new EventSource(changeStreamUrl(env));
      source.addEventListener("ready", () => {
        if (connectedBefore) refetch();
        connectedBefore = true;
        backoffMs = 1000;
        setStatus("live");
      });
      source.addEventListener("changed", refetch);
      source.onerror = () => {
        setStatus("reconnecting");
        if (source?.readyState === EventSource.CLOSED && !stopped) {
          retryTimer = setTimeout(connect, backoffMs);
          backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        }
      };
    };

    setStatus("connecting");
    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [env, queryClient]);

  return status;
}
