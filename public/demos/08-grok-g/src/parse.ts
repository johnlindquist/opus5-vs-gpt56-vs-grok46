import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { EVENT_TYPES, type EventType, type ParsedLine, type RawEvent } from "./types.ts";

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

export function parseJsonLine(line: string, lineNumber: number): ParsedLine {
  const raw = line;
  try {
    const value = JSON.parse(line);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return {
        line: lineNumber,
        raw,
        event: null,
        parse_error: "JSON value is not an object",
      };
    }
    return {
      line: lineNumber,
      raw,
      event: value as RawEvent,
      parse_error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    return {
      line: lineNumber,
      raw,
      event: null,
      parse_error: message,
    };
  }
}

export async function* readJsonl(path: string): AsyncGenerator<ParsedLine> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber += 1;
    if (line.length === 0) {
      continue;
    }
    yield parseJsonLine(line, lineNumber);
  }
}

export function parseTimestamp(ts: unknown): number | null {
  if (typeof ts !== "string" || ts.length === 0) {
    return null;
  }
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}
