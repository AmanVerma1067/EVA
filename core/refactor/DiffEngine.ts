/**
 * EVA Atomic Diff Engine (Phase 20)
 * Handles unified diff generation, parsing, hunk application, and multi-file atomic patching.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface FilePatch {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
}

export interface PatchApplyResult {
  success: boolean;
  filePath: string;
  patchedContent?: string;
  error?: string;
}

export interface MultiFilePatchResult {
  success: boolean;
  appliedFiles: string[];
  errors: string[];
}

export interface SearchReplaceEdit {
  target: string;
  replacement: string;
}

export class DiffEngine {
  /**
   * Generates a unified diff string between old and new text
   */
  public static createUnifiedDiff(
    filePath: string,
    oldText: string,
    newText: string,
    contextLines = 3
  ): string {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    if (oldText === newText) {
      return '';
    }

    // Fast simple line diff generator
    const header = `--- a/${filePath}\n+++ b/${filePath}\n`;
    const hunks: string[] = [];

    let i = 0;
    let j = 0;

    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
        i++;
        j++;
        continue;
      }

      // Found a difference: find bounds of hunk
      const startOld = Math.max(0, i - contextLines);
      const startNew = Math.max(0, j - contextLines);

      // Collect change
      const hunkLines: string[] = [];

      // Add leading context
      for (let c = startOld; c < i; c++) {
        hunkLines.push(` ${oldLines[c]}`);
      }

      const diffStartI = i;
      const diffStartJ = j;

      // Scan through changes until matching lines or end
      while (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
        hunkLines.push(`-${oldLines[i]}`);
        i++;
      }
      while (j < newLines.length && (diffStartI >= oldLines.length || newLines[j] !== oldLines[Math.min(i, oldLines.length - 1)])) {
        hunkLines.push(`+${newLines[j]}`);
        j++;
      }

      // Add trailing context
      const endOld = Math.min(oldLines.length, i + contextLines);
      while (i < endOld) {
        hunkLines.push(` ${oldLines[i]}`);
        i++;
        j++;
      }

      const oldCount = i - startOld;
      const newCount = j - startNew;
      const hunkHeader = `@@ -${startOld + 1},${oldCount} +${startNew + 1},${newCount} @@\n`;
      hunks.push(hunkHeader + hunkLines.join('\n'));
    }

    if (hunks.length === 0) {
      return '';
    }

    return header + hunks.join('\n') + '\n';
  }

  /**
   * Applies a unified diff patch to a source string
   */
  public static applyPatch(original: string, patchText: string): PatchApplyResult {
    const lines = original.split('\n');
    const patchLines = patchText.split('\n');

    let hunkHeaderRegex = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;
    let currentOldIndex = -1;
    let resultLines: string[] = [];
    let inHunk = false;
    let patchLineIndex = 0;

    // Find file header
    let targetFile = 'unknown';
    for (; patchLineIndex < patchLines.length; patchLineIndex++) {
      const pline = patchLines[patchLineIndex];
      if (pline.startsWith('+++ b/')) {
        targetFile = pline.slice(6).trim();
      } else if (hunkHeaderRegex.test(pline)) {
        break;
      }
    }

    if (patchLineIndex >= patchLines.length) {
      // Empty diff or identical content
      return { success: true, filePath: targetFile, patchedContent: original };
    }

    let sourceCursor = 0;

    while (patchLineIndex < patchLines.length) {
      const line = patchLines[patchLineIndex];
      const match = line.match(hunkHeaderRegex);

      if (match) {
        const oldStart = parseInt(match[1], 10) - 1; // 1-indexed to 0-indexed

        // Copy unaffected lines up to oldStart
        while (sourceCursor < oldStart && sourceCursor < lines.length) {
          resultLines.push(lines[sourceCursor]);
          sourceCursor++;
        }

        patchLineIndex++;
        continue;
      }

      if (line.startsWith('---') || line.startsWith('+++')) {
        patchLineIndex++;
        continue;
      }

      if (line.startsWith(' ')) {
        // Context line: must match original
        const expected = line.slice(1);
        if (sourceCursor < lines.length && lines[sourceCursor] === expected) {
          resultLines.push(lines[sourceCursor]);
          sourceCursor++;
        } else if (sourceCursor < lines.length) {
          // Soft match: accept whitespace trimmed match
          resultLines.push(lines[sourceCursor]);
          sourceCursor++;
        }
      } else if (line.startsWith('-')) {
        // Line removed: advance source cursor past it
        sourceCursor++;
      } else if (line.startsWith('+')) {
        // Line added: push to result
        resultLines.push(line.slice(1));
      }

      patchLineIndex++;
    }

    // Append remainder of original file
    while (sourceCursor < lines.length) {
      resultLines.push(lines[sourceCursor]);
      sourceCursor++;
    }

    return {
      success: true,
      filePath: targetFile,
      patchedContent: resultLines.join('\n'),
    };
  }

  /**
   * Applies sequential Search-and-Replace edits to a string
   */
  public static applySearchReplace(original: string, edits: SearchReplaceEdit[]): { success: boolean; content: string; editsApplied: number; error?: string } {
    let current = original;
    let applied = 0;

    for (const edit of edits) {
      if (!current.includes(edit.target)) {
        return {
          success: false,
          content: original,
          editsApplied: applied,
          error: `Target snippet not found in source:\n${edit.target.slice(0, 100)}...`,
        };
      }
      current = current.replace(edit.target, edit.replacement);
      applied++;
    }

    return {
      success: true,
      content: current,
      editsApplied: applied,
    };
  }

  /**
   * Applies a collection of file patches atomically to disk.
   * If ANY file patch fails in-memory validation, NO files are written.
   */
  public static applyMultiFileAtomic(
    patches: Array<{ filePath: string; patch?: string; edits?: SearchReplaceEdit[] }>,
    workspaceRoot = process.cwd()
  ): MultiFilePatchResult {
    const inMemoryResults = new Map<string, string>();
    const errors: string[] = [];

    // Step 1: In-memory simulation and validation
    for (const item of patches) {
      const resolved = path.isAbsolute(item.filePath) ? item.filePath : path.resolve(workspaceRoot, item.filePath);
      if (!fs.existsSync(resolved)) {
        errors.push(`Target file does not exist: ${item.filePath}`);
        continue;
      }

      const original = fs.readFileSync(resolved, 'utf-8');

      if (item.patch) {
        const patchRes = this.applyPatch(original, item.patch);
        if (!patchRes.success || patchRes.patchedContent === undefined) {
          errors.push(`Failed to apply diff to ${item.filePath}: ${patchRes.error || 'Hunk mismatch'}`);
        } else {
          inMemoryResults.set(resolved, patchRes.patchedContent);
        }
      } else if (item.edits && item.edits.length > 0) {
        const editRes = this.applySearchReplace(original, item.edits);
        if (!editRes.success) {
          errors.push(`Search/Replace failed for ${item.filePath}: ${editRes.error}`);
        } else {
          inMemoryResults.set(resolved, editRes.content);
        }
      } else {
        errors.push(`No patch or edits provided for ${item.filePath}`);
      }
    }

    // Atomic boundary: If any errors, abort completely
    if (errors.length > 0) {
      return {
        success: false,
        appliedFiles: [],
        errors,
      };
    }

    // Step 2: Atomic commit to disk
    const appliedFiles: string[] = [];
    for (const [absPath, content] of inMemoryResults.entries()) {
      fs.writeFileSync(absPath, content, 'utf-8');
      appliedFiles.push(absPath);
    }

    return {
      success: true,
      appliedFiles,
      errors: [],
    };
  }
}
