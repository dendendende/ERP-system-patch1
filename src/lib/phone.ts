/**
 * A WhatsApp number as people type it in Indonesia ("0812-3456-7890", "62 812...", "+62812...")
 * → the international form the database stores (+6281234567890). Null if it can't be one.
 */
export function toWhatsappNumber(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "");
  const international = digits.startsWith("+")
    ? digits
    : digits.startsWith("0")
      ? `+62${digits.slice(1)}`
      : digits.startsWith("62")
        ? `+${digits}`
        : null;
  return international && /^\+[1-9][0-9]{7,14}$/.test(international) ? international : null;
}
