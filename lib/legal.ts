/*
 * Operator details for imprint and privacy policy. They come from server
 * env vars instead of the code base, so a personal address never lands in
 * the (public) repository. Pages show a visible warning while any required
 * field is missing - a placeholder must never go live unnoticed.
 */

export type LegalConfig = {
  /** Name of the person or company responsible (§ 5 DDG, Art. 13 DSGVO). */
  operatorName: string | null;
  /** Postal address, one line per entry (separator "|" in the env var). */
  addressLines: string[];
  email: string | null;
  phone: string | null;
  /** Free text: who hosts the app and where (e.g. "Railway Corp., USA – Server in der EU"). */
  hosting: string | null;
  /** Free text: database/auth provider and region (e.g. "Supabase Inc. – Server in Frankfurt"). */
  database: string | null;
};

/** Version of the beta terms; bump when the text changes so acceptance can be re-asked. */
export const BETA_TERMS_VERSION = "2026-10-09";

const clean = (value: string | undefined) => (value && value.trim() ? value.trim() : null);

export function getLegalConfig(): LegalConfig {
  return {
    operatorName: clean(process.env.LEGAL_OPERATOR_NAME),
    addressLines: (process.env.LEGAL_ADDRESS ?? "")
      .split("|")
      .map((line) => line.trim())
      .filter(Boolean),
    email: clean(process.env.LEGAL_EMAIL),
    phone: clean(process.env.LEGAL_PHONE),
    hosting: clean(process.env.LEGAL_HOSTING),
    database: clean(process.env.LEGAL_DATABASE),
  };
}

/** Required for imprint and privacy policy; phone, hosting and database are optional/contextual. */
export function missingLegalFields(config: LegalConfig): string[] {
  const missing: string[] = [];
  if (!config.operatorName) missing.push("LEGAL_OPERATOR_NAME");
  if (config.addressLines.length === 0) missing.push("LEGAL_ADDRESS");
  if (!config.email) missing.push("LEGAL_EMAIL");
  return missing;
}
