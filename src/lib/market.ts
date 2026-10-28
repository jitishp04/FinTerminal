const NEW_YORK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * US equity regular session: Mon–Fri 09:30–16:00 New York time.
 * Exchange holidays and early closes are not handled yet.
 */
export function isUsMarketOpen(date: Date): boolean {
  const parts = Object.fromEntries(NEW_YORK.formatToParts(date).map((p) => [p.type, p.value]));
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}
