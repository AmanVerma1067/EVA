import { describe, it, expect } from 'vitest';
import { ScreenVisionTool } from '../../../tools/screen/ScreenVisionTool.js';
import * as path from 'node:path';

describe('Phase 9 — Screen Vision & Visual OCR', () => {
  const mockContext = {
    sessionId: 'test-session',
    deviceId: 'test-device',
    taskId: 'test-task',
    workspaceRoot: path.resolve(process.cwd()),
    abortSignal: new AbortController().signal,
  };

  it('should process image and extract mock text elements with query filtering', async () => {
    const tool = new ScreenVisionTool({
      runner: async () => [
        { text: 'File Edit Selection View', confidence: 1.0, x: 0.05, y: 0.01 },
        { text: 'Visual Studio Code', confidence: 0.99, x: 0.45, y: 0.01 },
        { text: 'Save All Changes', confidence: 0.95, x: 0.1, y: 0.2 },
      ],
    });

    const res = await tool.execute({ query: 'Studio' }, mockContext);
    expect(res.success).toBe(true);
    expect(res.data?.detectedTextCount).toBe(3);
    expect(res.data?.matchingElements).toContain('Visual Studio Code');
    expect(res.data?.matchingElements?.length).toBe(1);

    const ver = await tool.verify({ query: 'Studio' }, res);
    expect(ver.verified).toBe(true);
    expect(ver.status).toBe('CONFIRMED');
  });
});
