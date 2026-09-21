import { describe, it, expect } from 'vitest';
import { WindowListTool, WindowFocusTool, WindowCloseTool } from '../../../tools/macos/WindowTool.js';
import { KeyboardTypeTool, KeyboardShortcutTool } from '../../../tools/macos/KeyboardTool.js';
import { MouseClickTool } from '../../../tools/macos/MouseTool.js';
import { FileWriteTool } from '../../../tools/filesystem/FileWriteTool.js';
import { FileSearchTool } from '../../../tools/filesystem/FileSearchTool.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const mockContext = {
  sessionId: 'test-session',
  deviceId: 'test-device',
  taskId: 'test-task',
  workspaceRoot: path.resolve(process.cwd()),
  abortSignal: new AbortController().signal,
};

describe('Phase 5 — macOS Desktop Control Tools', () => {
  it('WindowListTool should return mock window list and verify', async () => {
    const tool = new WindowListTool({
      runner: async () => [
        { appName: 'Finder', title: 'Desktop' },
        { appName: 'Code', title: 'EVA — visual studio code' },
      ],
    });

    const res = await tool.execute({}, mockContext);
    expect(res.success).toBe(true);
    expect(res.data?.count).toBe(2);
    expect(res.data?.windows[0].appName).toBe('Finder');

    const ver = await tool.verify({}, res);
    expect(ver.verified).toBe(true);
    expect(ver.status).toBe('CONFIRMED');
  });

  it('WindowFocusTool and WindowCloseTool should invoke safely', async () => {
    const focusTool = new WindowFocusTool({ runner: async () => true });
    const focusRes = await focusTool.execute({ appName: 'Finder' }, mockContext);
    expect(focusRes.success).toBe(true);

    const closeTool = new WindowCloseTool({ runner: async () => true });
    const closeRes = await closeTool.execute({ appName: 'Finder' }, mockContext);
    expect(closeRes.success).toBe(true);
  });

  it('KeyboardTypeTool and KeyboardShortcutTool should simulate keys', async () => {
    const typeTool = new KeyboardTypeTool({ runner: async () => true });
    const typeRes = await typeTool.execute({ text: 'Hello EVA' }, mockContext);
    expect(typeRes.success).toBe(true);
    expect(typeRes.data?.typedCharacters).toBe(9);

    const shortcutTool = new KeyboardShortcutTool({ runner: async () => true });
    const shortRes = await shortcutTool.execute({ key: 'c', modifiers: ['command'] }, mockContext);
    expect(shortRes.success).toBe(true);
    expect(shortRes.data?.executedShortcut).toBe('command+c');
  });

  it('MouseClickTool should simulate mouse clicks', async () => {
    const mouseTool = new MouseClickTool({ runner: async () => true });
    const clickRes = await mouseTool.execute({ x: 100, y: 200, button: 'left' }, mockContext);
    expect(clickRes.success).toBe(true);
    expect(clickRes.data?.x).toBe(100);
  });

  it('FileWriteTool should create and verify file safely, blocking traversal', async () => {
    const writeTool = new FileWriteTool();
    const testFile = '.eva/test_write.txt';

    const res = await writeTool.execute({ filePath: testFile, content: 'Phase 5 tested!' }, mockContext);
    expect(res.success).toBe(true);
    expect(res.data?.bytesWritten).toBeGreaterThan(0);

    const ver = await writeTool.verify({ filePath: testFile, content: 'Phase 5 tested!' }, res, mockContext);
    expect(ver.verified).toBe(true);

    // Clean up
    await fs.unlink(path.resolve(mockContext.workspaceRoot, testFile)).catch(() => {});

    // Path traversal attempt
    await expect(
      writeTool.execute({ filePath: '../../etc/evil.txt', content: 'hack' }, mockContext)
    ).rejects.toThrow('Path traversal forbidden');
  });

  it('FileSearchTool should find workspace files by name and block traversal', async () => {
    const searchTool = new FileSearchTool();
    const res = await searchTool.execute({ query: 'package.json' }, mockContext);
    expect(res.success).toBe(true);
    expect(res.data?.totalFound).toBeGreaterThan(0);
    expect(res.data?.matches[0].name).toContain('package.json');

    await expect(
      searchTool.execute({ query: 'test', subDirectory: '../../' }, mockContext)
    ).rejects.toThrow('Search outside workspace forbidden');
  });
});
