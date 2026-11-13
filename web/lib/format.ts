const MAX_CENTAVOS = BigInt("9223372036854775807");

export function normalizePrice(input: string): string | null {
  const value = input.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const centavos = BigInt(whole + fraction.padEnd(2, "0"));
  if (centavos <= BigInt(0) || centavos > MAX_CENTAVOS) return null;
  return `${BigInt(whole).toString()}.${fraction.padEnd(2, "0")}`;
}

export function isMoney(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d*)\.\d{2}$/.test(value);
}

export function formatMoney(value: string): string {
  if (!isMoney(value)) throw new Error("Invalid money format");
  const [whole, fraction] = value.split(".");
  return `₱${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

export function formatEstimatedValue(weightKg: string, pricePerKg: string): string {
  const hundredthsOfKg = BigInt(weightKg.replace(".", ""));
  const centavosPerKg = BigInt(pricePerKg.replace(".", ""));
  const total = (hundredthsOfKg * centavosPerKg + BigInt(50)) / BigInt(100);
  const digits = total.toString().padStart(3, "0");
  return formatMoney(`${digits.slice(0, -2)}.${digits.slice(-2)}`);
}

export function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
  }).format(new Date(value));
}
