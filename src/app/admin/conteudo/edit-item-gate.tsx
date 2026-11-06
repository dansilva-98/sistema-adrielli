"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { serverEditSync } from "@/modules/content/edit-sync";

export function EditItemGate({
  serverVersion,
  savedVersion,
  children,
}: {
  serverVersion: number | null;
  savedVersion?: number;
  children: (api: {
    formKey: number;
    onDirty: (dirty: boolean) => void;
    onDiscard: () => void;
  }) => ReactNode;
}) {
  const [formKey, setFormKey] = useState(0);
  const [knownVersion, setKnownVersion] = useState(serverVersion ?? 0);
  const [dirty, setDirty] = useState(false);
  const router = useRouter();

  if (serverVersion != null) {
    const decision = serverEditSync({
      serverVersion,
      knownVersion,
      savedVersion,
      dirty,
    });
    if (decision.apply === "remember-save" && knownVersion !== decision.version) {
      setKnownVersion(decision.version);
    } else if (decision.apply === "reload") {
      setKnownVersion(serverVersion);
      setDirty(false);
      setFormKey(formKey + 1);
    }
  }

  const onDirty = useCallback((next: boolean) => {
    setDirty(next);
  }, []);

  const onDiscard = useCallback(() => {
    setDirty(false);
    setFormKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (serverVersion == null) return;
    const refresh = () => router.refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, serverVersion]);

  return (
    <>
      {children({
        formKey,
        onDirty,
        onDiscard,
      })}
    </>
  );
}
