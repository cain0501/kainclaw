// Minimal cron expression parsing and next-run calculation.
//
// Supports the standard 5-field cron subset:
//   minute hour day-of-month month day-of-week
//
// Field syntax: wildcard, N, step (star-slash-N), range (N-M), list (N,M,...).
// No L, W, ?, or name aliases. All times are interpreted in the process's
// local timezone — "0 9 * * *" means 9am wherever the CLI is running.

export type CronFields = {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
};

type FieldRange = { min: number; max: number };

const FIELD_RANGES: FieldRange[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 6 },
];

function expandField(field: string, range: FieldRange): number[] | null {
  const { min, max } = range;
  const out = new Set<number>();

  for (const part of field.split(",")) {
    const stepMatch = part.match(/^\*(?:\/(\d+))?$/);
    if (stepMatch) {
      const step = stepMatch[1] ? Number.parseInt(stepMatch[1], 10) : 1;
      if (step < 1) {
        return null;
      }
      for (let index = min; index <= max; index += step) {
        out.add(index);
      }
      continue;
    }

    const rangeMatch = part.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
    if (rangeMatch) {
      const lo = Number.parseInt(rangeMatch[1]!, 10);
      const hi = Number.parseInt(rangeMatch[2]!, 10);
      const step = rangeMatch[3] ? Number.parseInt(rangeMatch[3]!, 10) : 1;
      const isDow = min === 0 && max === 6;
      const effectiveMax = isDow ? 7 : max;
      if (lo > hi || step < 1 || lo < min || hi > effectiveMax) {
        return null;
      }
      for (let index = lo; index <= hi; index += step) {
        out.add(isDow && index === 7 ? 0 : index);
      }
      continue;
    }

    const singleMatch = part.match(/^\d+$/);
    if (singleMatch) {
      let value = Number.parseInt(part, 10);
      if (min === 0 && max === 6 && value === 7) {
        value = 0;
      }
      if (value < min || value > max) {
        return null;
      }
      out.add(value);
      continue;
    }

    return null;
  }

  if (out.size === 0) {
    return null;
  }
  return [...out].sort((left, right) => left - right);
}

/**
 * Parse a 5-field cron expression into expanded number arrays.
 * Returns null if invalid or unsupported syntax.
 */
export function parseCronExpression(expr: string): CronFields | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const expanded: number[][] = [];
  for (let index = 0; index < 5; index += 1) {
    const result = expandField(parts[index]!, FIELD_RANGES[index]!);
    if (!result) {
      return null;
    }
    expanded.push(result);
  }

  return {
    minute: expanded[0]!,
    hour: expanded[1]!,
    dayOfMonth: expanded[2]!,
    month: expanded[3]!,
    dayOfWeek: expanded[4]!,
  };
}

/**
 * Compute the next Date strictly after `from` that matches the cron fields,
 * using the process's local timezone. Walks forward minute-by-minute. Bounded
 * at 366 days; returns null if no match (impossible for valid cron, but
 * satisfies the type).
 *
 * Standard cron semantics: when both dayOfMonth and dayOfWeek are constrained
 * (neither is the full range), a date matches if EITHER matches.
 */
export function computeNextCronRun(
  fields: CronFields,
  from: Date,
): Date | null {
  const minuteSet = new Set(fields.minute);
  const hourSet = new Set(fields.hour);
  const domSet = new Set(fields.dayOfMonth);
  const monthSet = new Set(fields.month);
  const dowSet = new Set(fields.dayOfWeek);

  const domWild = fields.dayOfMonth.length === 31;
  const dowWild = fields.dayOfWeek.length === 7;

  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const maxIterations = 366 * 24 * 60;
  for (let index = 0; index < maxIterations; index += 1) {
    const month = cursor.getMonth() + 1;
    if (!monthSet.has(month)) {
      cursor.setMonth(cursor.getMonth() + 1, 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    const dayOfMonth = cursor.getDate();
    const dayOfWeek = cursor.getDay();
    const dayMatches =
      domWild && dowWild
        ? true
        : domWild
          ? dowSet.has(dayOfWeek)
          : dowWild
            ? domSet.has(dayOfMonth)
            : domSet.has(dayOfMonth) || dowSet.has(dayOfWeek);

    if (!dayMatches) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    if (!hourSet.has(cursor.getHours())) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
      continue;
    }

    if (!minuteSet.has(cursor.getMinutes())) {
      cursor.setMinutes(cursor.getMinutes() + 1);
      continue;
    }

    return cursor;
  }

  return null;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatLocalTime(minute: number, hour: number): string {
  const date = new Date(2000, 0, 1, hour, minute);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return cron;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];

  const everyMinMatch = minute.match(/^\*\/(\d+)$/);
  if (
    everyMinMatch &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    const every = Number.parseInt(everyMinMatch[1]!, 10);
    return every === 1 ? "Every minute" : `Every ${every} minutes`;
  }

  if (
    /^\d+$/.test(minute) &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    const minuteValue = Number.parseInt(minute, 10);
    if (minuteValue === 0) {
      return "Every hour";
    }
    return `Every hour at :${minuteValue.toString().padStart(2, "0")}`;
  }

  const everyHourMatch = hour.match(/^\*\/(\d+)$/);
  if (
    /^\d+$/.test(minute) &&
    everyHourMatch &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    const every = Number.parseInt(everyHourMatch[1]!, 10);
    const minuteValue = Number.parseInt(minute, 10);
    const suffix =
      minuteValue === 0 ? "" : ` at :${minuteValue.toString().padStart(2, "0")}`;
    return every === 1 ? `Every hour${suffix}` : `Every ${every} hours${suffix}`;
  }

  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) {
    return cron;
  }

  const minuteValue = Number.parseInt(minute, 10);
  const hourValue = Number.parseInt(hour, 10);
  const formattedTime = formatLocalTime(minuteValue, hourValue);

  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Every day at ${formattedTime}`;
  }

  if (dayOfMonth === "*" && month === "*" && /^\d$/.test(dayOfWeek)) {
    const dayName = DAY_NAMES[Number.parseInt(dayOfWeek, 10) % 7];
    if (dayName) {
      return `Every ${dayName} at ${formattedTime}`;
    }
  }

  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "1-5") {
    return `Weekdays at ${formattedTime}`;
  }

  return cron;
}

export function nextCronRunMs(cron: string, fromMs: number): number | null {
  const fields = parseCronExpression(cron);
  if (!fields) {
    return null;
  }
  const next = computeNextCronRun(fields, new Date(fromMs));
  return next ? next.getTime() : null;
}
