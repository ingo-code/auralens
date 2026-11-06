/** Browser download of generated content (no server round trip). */
export function downloadBlob(content: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoke after the click has been handled; immediate revocation can cancel large downloads.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
