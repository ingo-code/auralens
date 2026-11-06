"use client";

import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type ImageDropzoneProps = {
  /** Single-image mode: called with the first valid file. */
  onFileSelected?: (file: File) => void;
  /** Multi-image mode (with `multiple`): called with all valid files. */
  onFilesSelected?: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  title?: string;
  hint?: string;
  buttonLabel?: string;
};

export function ImageDropzone({
  onFileSelected,
  onFilesSelected,
  multiple = false,
  disabled = false,
  title,
  hint,
  buttonLabel,
}: ImageDropzoneProps) {
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      const files = Array.from(list ?? []);
      if (files.length === 0) return;
      const valid = files.filter((file) => ACCEPTED_TYPES.includes(file.type));
      // Drag & drop bypasses the input's `accept` filter, so check here.
      if (valid.length !== files.length || valid.length === 0) {
        setRejectionError(t.dropzone.unsupportedType);
        if (valid.length === 0) return;
      } else {
        setRejectionError(null);
      }
      if (multiple && onFilesSelected) onFilesSelected(valid);
      else onFileSelected?.(valid[0]);
    },
    [multiple, onFileSelected, onFilesSelected, t]
  );

  const openFilePicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onClick={openFilePicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFilePicker();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!disabled) handleFiles(event.dataTransfer.files);
        }}
        className={`group flex w-full flex-col items-center justify-center gap-5 border border-dashed px-6 py-14 text-center transition-colors sm:px-10 ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        } ${
          isDragging
            ? "border-signal bg-signal/10"
            : "border-stone-300 bg-room-deep hover:border-signal/80"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple={multiple}
          className="hidden"
          disabled={disabled}
          data-testid="image-dropzone-input"
          onChange={(event) => {
            handleFiles(event.target.files);
            // Allow picking the same file again after a reset.
            event.target.value = "";
          }}
        />

        {/* Aperture mark */}
        <div className="flex h-16 w-16 items-center justify-center bg-panel-high text-signal-soft transition-colors group-hover:bg-signal group-hover:text-on-signal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} className="h-8 w-8" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="m14.31 8 5.74 9.94" />
            <path d="M9.69 8h11.48" />
            <path d="m7.38 12 5.74-9.94" />
            <path d="M9.69 16 3.95 6.06" />
            <path d="M14.31 16H2.83" />
            <path d="m16.62 12-5.74 9.94" />
          </svg>
        </div>

        <div className="space-y-2">
          <p className="font-display text-xl text-ink sm:text-2xl">{title ?? t.dropzone.prompt}</p>
          <p className="font-mono text-xs text-ink-muted">{hint ?? t.dropzone.hint}</p>
        </div>

        {buttonLabel && (
          <span className="bg-signal px-5 py-2.5 text-sm font-semibold uppercase tracking-wide text-on-signal transition-colors group-hover:bg-signal-soft">
            {buttonLabel}
          </span>
        )}
      </div>

      {rejectionError && <p className="mt-3 text-sm text-red-600">{rejectionError}</p>}
    </div>
  );
}
