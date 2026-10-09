import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/login/page";
import { BETA_TERMS_VERSION } from "@/lib/legal";

const signUp = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signUp, signInWithPassword: vi.fn().mockResolvedValue({ error: null }) } }),
}));

describe("Registrierung", () => {
  it("verlangt die Zustimmung zu den Beta-Bedingungen und speichert sie als Nachweis", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Noch kein Konto? Registrieren" }));

    const consent = screen.getByRole("checkbox");
    expect(consent).toBeRequired();
    expect(screen.getByRole("link", { name: "Beta-Bedingungen" })).toHaveAttribute("href", "/beta-bedingungen");
    expect(screen.getByRole("link", { name: "Datenschutz" })).toHaveAttribute("href", "/datenschutz");

    await user.type(screen.getByLabelText("E-Mail"), "tester@example.org");
    await user.type(screen.getByLabelText("Passwort"), "geheim123");
    await user.click(screen.getByRole("button", { name: "Registrieren" }));
    // The browser blocks the form while the required box is unticked.
    expect(signUp).not.toHaveBeenCalled();

    await user.click(consent);
    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(signUp).toHaveBeenCalledWith({
      email: "tester@example.org",
      password: "geheim123",
      options: { data: { beta_terms_version: BETA_TERMS_VERSION, beta_terms_accepted_at: expect.any(String) } },
    });
  });
});
