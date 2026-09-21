/**
 * EVA Speech Normalizer
 * Conforms to Section 2 & 3 of EVA Master Orchestration Spec
 * Strips conversational filler, hesitation markers, and conversational qualifiers
 * without corrupting the real target entity.
 */

import { NormalizedSpeech } from './types.js';

const LEADING_FILLERS: RegExp[] = [
  /^(?:hey|hi|hello|yo|ok|okay|sup)\s+(?:eva[,.]?)\s+/i,
  /^(?:eva[,.]?)\s+/i,
  /^(?:can you(?:\s+please)?|could you(?:\s+please)?|would you(?:\s+mind| please)?)\s+/i,
  /^(?:please\s+)/i,
  /^(?:i want you to|i'd like you to|i need you to)\s+/i,
  /^(?:help me(?:\s+to)?)\s+/i,
  /^(?:just\s+)/i,
  /^(?:go ahead and\s+)/i,
];

const HESITATIONS: RegExp[] = [
  /\b(?:uh|um|er|ah|like|you know)\b/gi,
];

const TRAILING_QUALIFIERS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\s+(?:over\s+here|right\s+here|over\s+there|right\s+there|up\s+here|down\s+here)[.?!]?$/i, label: 'location_qualifier' },
  { pattern: /\s+(?:for\s+me)[.?!]?$/i, label: 'beneficiary_filler' },
  { pattern: /\s+(?:real\s+quick|quickly|right\s+now|now)[.?!]?$/i, label: 'urgency_filler' },
  { pattern: /\s+(?:on\s+this\s+mac|on\s+my\s+mac|on\s+my\s+screen)[.?!]?$/i, label: 'device_qualifier' },
  { pattern: /\s+(?:please)[.?!]?$/i, label: 'polite_suffix' },
];

export class SpeechNormalizer {
  /**
   * Normalizes raw spoken or typed transcripts into clean text with separated qualifiers
   */
  public normalize(rawInput: string): NormalizedSpeech {
    const rawText = rawInput.trim();
    let cleaned = rawText;
    const strippedFillers: string[] = [];
    const strippedQualifiers: string[] = [];

    // 1. Strip leading speech filler preambles
    let changed = true;
    while (changed) {
      changed = false;
      for (const pattern of LEADING_FILLERS) {
        if (pattern.test(cleaned)) {
          const match = cleaned.match(pattern);
          if (match) {
            strippedFillers.push(match[0].trim());
          }
          cleaned = cleaned.replace(pattern, '').trim();
          changed = true;
        }
      }
    }

    // 2. Strip mid-sentence hesitation markers
    for (const pattern of HESITATIONS) {
      if (pattern.test(cleaned)) {
        const matches = cleaned.match(pattern);
        if (matches) {
          strippedFillers.push(...matches.map((m) => m.trim()));
        }
        cleaned = cleaned.replace(pattern, ' ').replace(/\s{2,}/g, ' ').trim();
      }
    }

    // 3. Strip trailing conversational qualifiers (e.g. "over here", "for me", "right now please")
    changed = true;
    while (changed) {
      changed = false;
      for (const { pattern, label } of TRAILING_QUALIFIERS) {
        if (pattern.test(cleaned)) {
          const match = cleaned.match(pattern);
          if (match) {
            strippedQualifiers.push(match[0].trim());
          }
          cleaned = cleaned.replace(pattern, '').trim();
          changed = true;
        }
      }
    }

    // 4. Clean trailing punctuation residues and normalize whitespace
    cleaned = cleaned.replace(/[?.!,]+$/, '').trim();
    if (cleaned.length === 0) {
      cleaned = rawText;
    }

    const normalizedTokens = cleaned.split(/\s+/).filter((t) => t.length > 0);

    return {
      rawText,
      cleanedText: cleaned,
      strippedFillers,
      strippedQualifiers,
      normalizedTokens,
    };
  }
}
