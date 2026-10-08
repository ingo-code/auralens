"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";

type CopyButtonProps = {
  text: string;
  label?: string;
  className?: string;
};

export function CopyButton({ text, label, className = "" }: CopyButtonProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail outside a secure context - nothing to recover.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`text-xs font-medium text-stone-600 transition-colors hover:text-violet-700 ${className}`}
    >
      {copied ? t.common.copied : (label ?? t.common.copy)}
    </button>
  );
}
