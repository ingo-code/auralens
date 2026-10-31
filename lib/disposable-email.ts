/*
 * Disposable ("throwaway") e-mail domains. Every confirmed account gets free
 * beta credits, so such addresses would allow farming credits with many
 * accounts. The database rejects signups with them (migration
 * 20261026120000_abuse_protection.sql, table `blocked_email_domains`); this
 * copy lets the login page explain the refusal up front. A test keeps both
 * lists identical.
 */
export const DISPOSABLE_EMAIL_DOMAINS: readonly string[] = [
  "0-mail.com", "10minutemail.com", "10minutemail.net", "20minutemail.com",
  "33mail.com", "anonbox.net", "burnermail.io", "byom.de",
  "discard.email", "dispostable.com", "dropmail.me", "einrot.com",
  "emailondeck.com", "fakeinbox.com", "fakemail.net", "getairmail.com",
  "getnada.com", "guerrillamail.biz", "guerrillamail.com", "guerrillamail.de",
  "guerrillamail.info", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com",
  "harakirimail.com", "inboxbear.com", "incognitomail.org", "jetable.org",
  "mail-temp.com", "mailcatch.com", "maildrop.cc", "mailinator.com",
  "mailinator.net", "mailnesia.com", "mailpoof.com", "mintemail.com",
  "mohmal.com", "mytemp.email", "mytrashmail.com", "nada.email",
  "sharklasers.com", "spam4.me", "spambog.com", "spambox.us",
  "spamgourmet.com", "spoofmail.de", "temp-mail.io", "temp-mail.org",
  "tempail.com", "tempinbox.com", "tempmail.com", "tempmail.dev",
  "tempmail.net", "tempmail.plus", "tempmailo.com", "tempr.email",
  "throwawaymail.com", "trash-mail.com", "trashmail.com", "trashmail.de",
  "trashmail.net", "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org",
  "yopmail.com", "yopmail.fr", "yopmail.net", "zetmail.com",
];

/** True for addresses at a listed domain or one of its subdomains. */
export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").at(-1) ?? "";
  if (!email.includes("@") || !domain) return false;
  return DISPOSABLE_EMAIL_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}
