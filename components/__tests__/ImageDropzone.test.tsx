import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageDropzone } from "@/components/ImageDropzone";

function getInput() {
  return screen.getByTestId("image-dropzone-input") as HTMLInputElement;
}

describe("ImageDropzone", () => {
  it("ruft onFileSelected mit einer gültigen Bilddatei auf", async () => {
    const onFileSelected = vi.fn();
    render(<ImageDropzone onFileSelected={onFileSelected} />);

    const file = new File(["bytes"], "photo.png", { type: "image/png" });
    await userEvent.upload(getInput(), file);

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it("lehnt nicht unterstützte Dateitypen per Drag & Drop ab, ohne onFileSelected aufzurufen", () => {
    // Drag & drop bypasses the input's `accept` filter (unlike the native
    // file picker), so this is the realistic path to the rejection branch.
    const onFileSelected = vi.fn();
    render(<ImageDropzone onFileSelected={onFileSelected} />);

    const file = new File(["not an image"], "notes.txt", { type: "text/plain" });
    fireEvent.drop(screen.getByRole("button"), {
      dataTransfer: { files: [file] },
    });

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(screen.getByText(/Nicht unterstützter Dateityp/i)).toBeInTheDocument();
  });

  it("deaktiviert den Dateiauswahl-Input, wenn disabled gesetzt ist", () => {
    render(<ImageDropzone onFileSelected={vi.fn()} disabled />);
    expect(getInput()).toBeDisabled();
  });
});
