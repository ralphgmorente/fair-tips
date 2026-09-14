"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which is what makes the app installable.
 *
 * Development is skipped: a worker caching build assets across hot reloads serves stale
 * chunks and produces confusing "module not found" failures.
 *
 * An installed copy is reopened from a snapshot rather than freshly loaded, so without
 * the checks below it can sit on the build it was installed with — a manager would keep
 * seeing an old version of the app with no way to know, and no way to force a reload
 * without the browser chrome a standalone window does not have.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    if (!("serviceWorker" in navigator)) {
      return;
    }

    let reloading = false;
    let registration: ServiceWorkerRegistration | null = null;

    // A new worker taking over means the files behind this page have changed.
    const onControllerChange = () => {
      if (reloading) {
        return;
      }
      reloading = true;
      window.location.reload();
    };

    // Reopening the app is the moment to look for a new deploy.
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") {
        registration?.update().catch(() => {
          // Offline, or the check failed; the page keeps working on what it has.
        });
      }
    };

    const register = () => {
      navigator.serviceWorker
        // updateViaCache "none" so the worker script itself is never served from the
        // HTTP cache, which is how an old worker outlives the deploy that replaced it.
        .register("/sw.js", { updateViaCache: "none" })
        .then((next) => {
          registration = next;
          document.addEventListener("visibilitychange", checkForUpdate);
        })
        .catch((error) => {
          console.error("service worker registration failed", error);
        });
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
