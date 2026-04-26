import { lazy, type ComponentType } from "react";

type LazyModule<T extends ComponentType<any>> = { default: T };

const STORAGE_PREFIX = "rainmaker:lazy-reload:";

function getErrorText(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error ?? "");
}

export function isDynamicImportError(error: unknown) {
  const message = getErrorText(error).toLowerCase();

  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("chunkloaderror") ||
    message.includes("loading chunk")
  );
}

function getReloadKey(chunkName: string) {
  return `${STORAGE_PREFIX}${chunkName}`;
}

function hasReloadedFor(chunkName: string) {
  try {
    return window.sessionStorage.getItem(getReloadKey(chunkName)) === "true";
  } catch {
    return false;
  }
}

function markReloadedFor(chunkName: string) {
  try {
    window.sessionStorage.setItem(getReloadKey(chunkName), "true");
  } catch {
    // If sessionStorage is unavailable, the reload is still worth attempting.
  }
}

function clearReloadMarker(chunkName: string) {
  try {
    window.sessionStorage.removeItem(getReloadKey(chunkName));
  } catch {
    // Ignore storage failures; successful import means the app is healthy.
  }
}

export function lazyWithReload<T extends ComponentType<any>>(
  importer: () => Promise<LazyModule<T>>,
  chunkName: string,
) {
  return lazy(async () => {
    try {
      const module = await importer();
      clearReloadMarker(chunkName);
      return module;
    } catch (error) {
      if (
        typeof window !== "undefined" &&
        isDynamicImportError(error) &&
        !hasReloadedFor(chunkName)
      ) {
        markReloadedFor(chunkName);
        window.location.reload();
        return new Promise<LazyModule<T>>(() => {});
      }

      throw error;
    }
  });
}
