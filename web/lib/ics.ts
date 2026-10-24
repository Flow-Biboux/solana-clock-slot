function utcStamp(unixSecs: number): string {
  return new Date(unixSecs * 1000).toISOString().replace(/[-:]/g, "").replace(".000Z", "Z");
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export interface CalendarEvent {
  field: string;
  slot: number;
  realUnix: number;
  intendedIso: string;
  range: string;
}

export function buildIcs(events: CalendarEvent[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//solana-slot-clock//safu//EN", "CALSCALE:GREGORIAN"];
  for (const event of events) {
    const start = utcStamp(event.realUnix);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.field}-${event.slot}@solana.biboux.com`,
      `DTSTAMP:${start}`,
      `DTSTART:${start}`,
      `SUMMARY:${escapeText(`${event.field} (real, slot ${event.slot})`)}`,
      `DESCRIPTION:${escapeText(`400 ms date: ${event.intendedIso}. Range: ${event.range}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const start = utcStamp(event.realUnix);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${event.field} (real, slot ${event.slot})`,
    dates: `${start}/${start}`,
    details: `400 ms date: ${event.intendedIso}. Range: ${event.range}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
