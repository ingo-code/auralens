"use client";

import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type ImageDropzoneProps = {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
};

export function ImageDropzone({ onFileSelected, disabled = false }: ImageDropzoneProps) {
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setRejectionError(t.dropzone.unsupportedType);
        return;
      }
      setRejectionError(null);
      onFileSelected(file);
    },
    [onFileSelected, t]
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
        className={`flex w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-8 py-16 text-center transition-colors ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        } ${
          isDragging
            ? "border-violet-500 bg-violet-50 shadow-lg shadow-violet-500/10"
            : "border-stone-300 bg-white/80 shadow-sm backdrop-blur hover:border-violet-400 hover:bg-white hover:shadow-md"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          disabled={disabled}
          data-testid="image-dropzone-input"
          onChange={(event) => handleFiles(event.target.files)}
        />

        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-7 w-7"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3.75 3.75 0 0 1 4.237 4.433A4.5 4.5 0 0 1 18.75 19.5H6.75Z"
            />
          </svg>
        </div>

        <div className="space-y-1">
          <p className="text-base font-medium text-stone-900">{t.dropzone.prompt}</p>
          <p className="text-sm text-stone-500">{t.dropzone.hint}</p>
        </div>
      </div>

      {rejectionError && <p className="mt-3 text-sm text-red-600">{rejectionError}</p>}
    </div>
  );
}
