"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";

/** Privacy information right where images are collected (Art. 13 DSGVO). */
export function UploadNotice() {
  const { t } = useI18n();
  return (
    <p className="w-full rounded-xl bg-stone-100/80 px-4 py-3 text-xs leading-relaxed text-stone-600" data-testid="upload-notice">
      {t.legal.uploadNotice}{" "}
      <Link href="/datenschutz" className="font-medium text-violet-700 underline">
        {t.legal.uploadNoticeLink}
      </Link>
    </p>
  );
}
