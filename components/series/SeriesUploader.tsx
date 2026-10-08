"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { ALLOWED_IMAGE_TYPES } from "@/lib/image-validation";
import { MAX_SERIES_IMAGES } from "@/lib/series-analysis-schema";

export type SelectedImage = {
  file: File;
  previewUrl: string;
};

type SeriesUploaderProps = {
  images: SelectedImage[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
};

export function SeriesUploader({ images, onAdd, onRemove, disabled = false }: SeriesUploaderProps) {
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const full = images.length >= MAX_SERIES_IMAGES;

  const addFiles = (list: FileList | null) => {
    if (list && list.length > 0) onAdd(Array.from(list));
  };

  return (
    <div className="w-full space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled || full}
        onClick={() => !disabled && !full && inputRef.current?.click()}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !disabled && !full) {
            event.preventDefault();
            inputRef.current?.click();
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
          if (!disabled) addFiles(event.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          disabled || full ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        } ${
          isDragging
            ? "border-violet-500 bg-violet-50 shadow-lg shadow-violet-500/10"
            : "border-stone-300 bg-white/80 shadow-sm backdrop-blur hover:border-violet-400 hover:bg-white hover:shadow-md"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          className="hidden"
          disabled={disabled}
          data-testid="series-uploader-input"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = ""; // allow re-adding the same file after removing it
          }}
        />
        <p className="text-base font-medium text-stone-900">
          {full ? t.series.uploaderFull(MAX_SERIES_IMAGES) : t.series.uploaderPrompt}
        </p>
        <p className="text-sm text-stone-500">
          {t.series.uploaderHint(MAX_SERIES_IMAGES)}
        </p>
      </div>

      {images.length > 0 && (
        <ol className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {images.map((image, i) => (
            <li key={image.previewUrl} className="group relative overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- Objekt-URL einer lokalen Datei */}
              <img src={image.previewUrl} alt={image.file.name} className="aspect-square w-full object-cover" />
              <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1.5 py-0.5 text-xs font-medium text-stone-900">
                {t.common.image(i + 1)}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  aria-label={t.series.removeImage(i + 1)}
                  className="absolute right-1.5 top-1.5 rounded bg-white/90 px-1.5 py-0.5 text-xs text-stone-700 opacity-0 transition-opacity hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
