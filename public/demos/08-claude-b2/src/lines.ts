/**
 * Incremental line reader.
 *
 * The whole point is to never hold the file in memory as one string: chunks
 * arrive from the stream, and lines are emitted as soon as a newline is seen.
 */

export interface RawLine {
  line: number;
  text: string;
}

/** Split a buffered chunk tail into complete lines plus a leftover remainder. */
function splitChunk(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

function stripCr(text: string): string {
  return text.endsWith("\r") ? text.slice(0, -1) : text;
}

/**
 * Yield every physical line of a UTF-8 text file with its 1-based line number.
 * A trailing newline does not produce a phantom final line.
 */
export async function* readLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<RawLine> {
  const decoder = new TextDecoder("utf-8");
  const reader = stream.getReader();
  let buffer = "";
  let lineNumber = 0;
  let first = true;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { lines, rest } = splitChunk(buffer);
      buffer = rest;
      for (let text of lines) {
        if (first) {
          text = text.replace(/^﻿/, "");
          first = false;
        }
        lineNumber += 1;
        yield { line: lineNumber, text: stripCr(text) };
      }
    }
    buffer += decoder.decode();
    if (buffer.length > 0) {
      if (first) buffer = buffer.replace(/^﻿/, "");
      lineNumber += 1;
      yield { line: lineNumber, text: stripCr(buffer) };
    }
  } finally {
    reader.releaseLock();
  }
}

/** Convenience wrapper for a path on disk. */
export function readFileLines(path: string): AsyncGenerator<RawLine> {
  return readLines(Bun.file(path).stream());
}
