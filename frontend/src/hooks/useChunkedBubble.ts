/**
 * Cycle a long boss speech bubble through sentence-sized chunks so Claude's
 * response reads like a fast back-and-forth conversation with Pedro instead
 * of one wall-of-text static bubble.
 *
 * Behaviour:
 * - Splits `bubble.text` into chunks by sentence boundary (.!?) with a soft
 *   character cap so very long sentences still get broken up.
 * - Renders chunk 0 immediately, advances every `intervalMs`, and freezes on
 *   the last chunk so the final line stays visible (matches the existing
 *   `persistent: true` semantics of boss bubbles).
 * - Resets when the source text changes (new response from Claude).
 * - Passes the bubble through unchanged when text is short / single chunk.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import type { BubbleContent } from "@/types";

/** Soft cap per chunk. Long sentences get broken at this size. */
const MAX_CHUNK_CHARS = 90;
/** Minimum chunk size — avoids tiny "Yes." snippets flashing by. */
const MIN_CHUNK_CHARS = 24;

function splitIntoChunks(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= MAX_CHUNK_CHARS) return [trimmed];

  // Pass 1: split on sentence terminators while keeping the terminator.
  const rawSentences = trimmed
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Pass 2: merge short fragments and break long ones at word boundaries.
  const chunks: string[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) {
      chunks.push(buffer);
      buffer = "";
    }
  };

  for (const sentence of rawSentences) {
    if (sentence.length > MAX_CHUNK_CHARS) {
      flush();
      // Break the long sentence on word boundaries up to MAX_CHUNK_CHARS each.
      let rest = sentence;
      while (rest.length > MAX_CHUNK_CHARS) {
        const cutAt = rest.lastIndexOf(" ", MAX_CHUNK_CHARS);
        const slice = cutAt > MIN_CHUNK_CHARS ? rest.slice(0, cutAt) : rest.slice(0, MAX_CHUNK_CHARS);
        chunks.push(slice.trim());
        rest = rest.slice(slice.length).trim();
      }
      if (rest) buffer = rest;
      continue;
    }

    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    if (candidate.length > MAX_CHUNK_CHARS) {
      flush();
      buffer = sentence;
    } else if (candidate.length < MIN_CHUNK_CHARS) {
      buffer = candidate;
    } else {
      buffer = candidate;
      flush();
    }
  }
  flush();

  return chunks;
}

/**
 * Returns a derived BubbleContent whose `text` rotates through chunks of the
 * source bubble's text every `intervalMs` (default 1800ms). Holds on the
 * last chunk indefinitely.
 */
export function useChunkedBubble(
  bubble: BubbleContent | null,
  intervalMs: number = 1800,
): BubbleContent | null {
  const sourceText = bubble?.text ?? "";

  const chunks = useMemo(() => splitIntoChunks(sourceText), [sourceText]);
  const [idx, setIdx] = useState(0);

  // Reset to the first chunk whenever a new response comes in.
  useEffect(() => {
    setIdx(0);
  }, [sourceText]);

  // Advance until we hit the last chunk, then stop.
  useEffect(() => {
    if (chunks.length <= 1) return;
    if (idx >= chunks.length - 1) return;
    const t = setTimeout(() => setIdx((i) => i + 1), intervalMs);
    return () => clearTimeout(t);
  }, [idx, chunks.length, intervalMs]);

  if (!bubble) return null;
  if (chunks.length === 0) return bubble;
  const chunkText = chunks[idx] ?? chunks[chunks.length - 1] ?? bubble.text;
  return { ...bubble, text: chunkText };
}
