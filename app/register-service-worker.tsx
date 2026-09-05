"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which is what makes the app installable.
 *
 * Development is skipped: a worker caching build assets across hot reloads serves stale
 * chunks and produces confusing "module not found" failures.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("service worker registration failed", error);
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
