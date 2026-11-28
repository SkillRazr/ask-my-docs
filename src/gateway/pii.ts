// Personal data and secrets, found by pattern. Patterns miss things and sometimes
// match the wrong thing, so treat this as one layer, not a guarantee. For more
// accuracy, use a dedicated service (for example Google Cloud's Sensitive Data
// Protection) behind the same function.
const PATTERNS: {
  kind: string;
  pattern: RegExp;
  check?: (match: string) => boolean;
}[] = [
  {
    kind: "private_key",
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    kind: "api_key",
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})\b/g,
  },
  { kind: "email", pattern: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g },
  { kind: "card", pattern: /\b(?:\d[ -]?){12,18}\d\b/g, check: luhn },
  { kind: "aadhaar", pattern: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g },
  { kind: "pan", pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { kind: "phone", pattern: /(?:\+91[ -]?)?\b[6-9]\d{4}[ -]?\d{5}\b/g },
];

export const SECRET_KINDS = new Set(["private_key", "api_key"]);

// Replaces each match with a label like [EMAIL], and says which kinds it found.
// It never returns or logs the values themselves.
export function redact(text: string, kinds?: Set<string>) {
  const found = new Set<string>();
  let result = text;
  for (const { kind, pattern, check } of PATTERNS) {
    if (kinds && !kinds.has(kind)) continue;
    result = result.replace(pattern, (match) => {
      if (check && !check(match)) return match;
      found.add(kind);
      return `[${kind.toUpperCase()}]`;
    });
  }
  return { text: result, found: [...found] };
}

// Card numbers have a check digit (the Luhn algorithm), which rules out most
// random long numbers such as order ids.
function luhn(value: string) {
  const digits = value.replace(/\D/g, "");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
