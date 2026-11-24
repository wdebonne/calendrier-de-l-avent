// Pure SMTP helpers, no server dependencies so they can be unit tested.

/**
 * Port 465 is always TLS from the first byte; 25 and 587 always start in clear text and upgrade
 * with STARTTLS. The wrong combination fails with "wrong version number". When the user asked for
 * encryption on a STARTTLS port, the upgrade is made mandatory so nothing is ever sent in clear.
 */
export function smtpTls(port: number, secure: boolean): { secure: boolean; requireTLS: boolean } {
  if (port === 465) return { secure: true, requireTLS: false };
  if (port === 587 || port === 25) return { secure: false, requireTLS: secure };
  return { secure, requireTLS: false };
}

export type SmtpErrorKey = "errTls" | "errAuth" | "errHost" | "errRefused" | "errTimeout" | "errCertificate" | "errSender";

/** Maps a nodemailer / Node error to a plain explanation, or null when it is not a known case. */
export function smtpErrorKey(error: { code?: string; responseCode?: number; message?: string }): SmtpErrorKey | null {
  const message = error.message ?? "";
  if (/wrong version number|packet length too long/i.test(message)) return "errTls";
  if (/self[- ]signed|unable to (verify|get)|certificate|altnames/i.test(message)) return "errCertificate";
  if (/STARTTLS/i.test(message)) return "errTls";
  if (error.code === "EAUTH" || error.responseCode === 535) return "errAuth";
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message) || error.code === "EDNS") return "errHost";
  if (/ECONNREFUSED/i.test(message)) return "errRefused";
  if (error.code === "ETIMEDOUT" || /timeout|ETIMEDOUT/i.test(message)) return "errTimeout";
  if (error.responseCode === 550 || error.responseCode === 553 || error.responseCode === 554) return "errSender";
  return null;
}
