import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AppLaunchTool } from '../../../tools/application/AppLaunchTool.js';
import { AppStatusTool } from '../../../tools/application/AppStatusTool.js';
import { TerminalExecTool, terminalExecutionBuffer } from '../../../tools/terminal/TerminalExecTool.js';
import { TerminalOutputTool } from '../../../tools/terminal/TerminalOutputTool.js';
import { FileReadTool } from '../../../tools/filesystem/FileReadTool.js';
import { ScreenCaptureTool } from '../../../tools/screen/ScreenCaptureTool.js';
import { ExecutionContext } from '../../../core/tools/ToolContract.js';

describe('Phase 2 Initial Tools Verification', () => {
  const dummyCtx: ExecutionContext = {
    taskId: 'task-initial',
    sessionId: 'sess-initial',
    deviceId: 'dev-initial',
    workspaceRoot: process.cwd(),
    abortSignal: new AbortController().signal,
  };

  describe('AppLaunchTool', () => {
    it('should launch app and verify status using verifier', async () => {
      let launchedApp = '';
      const tool = new AppLaunchTool({
        runner: async (app) => {
          launchedApp = app;
          return true;
        },
        verifier: async (app) => app === 'Calculator',
      });

      const res = await tool.execute({ appName: 'Calculator' }, dummyCtx);
      expect(res.success).toBe(true);
      expect(launchedApp).toBe('Calculator');

      const verification = await tool.verify({ appName: 'Calculator' }, res, dummyCtx);
      expect(verification.verified).toBe(true);
      expect(verification.status).toBe('CONFIRMED');
    });
  });

  describe('AppStatusTool', () => {
    it('should inspect running process PIDs', async () => {
      const tool = new AppStatusTool({
        inspector: async (app) => (app === 'Safari' ? [1234, 5678] : []),
      });

      const resRunning = await tool.execute({ appName: 'Safari' }, dummyCtx);
      expect(resRunning.success).toBe(true);
      expect(resRunning.data?.running).toBe(true);
      expect(resRunning.data?.pids).toEqual([1234, 5678]);

      const resStopped = await tool.execute({ appName: 'NonExistentApp' }, dummyCtx);
      expect(resStopped.success).toBe(true);
      expect(resStopped.data?.running).toBe(false);
      expect(resStopped.data?.pids).toEqual([]);
    });
  });

  describe('TerminalExecTool & TerminalOutputTool', () => {
    it('should execute command, buffer output, and allow retrieval via TerminalOutputTool', async () => {
      const execTool = new TerminalExecTool({
        executor: async (cmd) => ({
          exitCode: 0,
          stdout: `Executed: ${cmd}`,
          stderr: '',
        }),
      });

      const execRes = await execTool.execute({ command: 'echo "hello"' }, dummyCtx);
      expect(execRes.success).toBe(true);
      expect(execRes.data?.exitCode).toBe(0);
      expect(execRes.data?.stdout).toBe('Executed: echo "hello"');

      const executionId = execRes.data!.executionId;
      expect(terminalExecutionBuffer.has(executionId)).toBe(true);

      const outputTool = new TerminalOutputTool();
      const outputRes = await outputTool.execute({ executionId }, dummyCtx);
      expect(outputRes.success).toBe(true);
      expect(outputRes.data?.stdout).toBe('Executed: echo "hello"');

      const verification = await outputTool.verify({ executionId }, outputRes);
      expect(verification.verified).toBe(true);
    });
  });

  describe('FileReadTool', () => {
    it('should read a valid file inside the permitted workspace', async () => {
      const tool = new FileReadTool();
      // Read package.json which exists in the current workspace
      const res = await tool.execute({ path: 'package.json', encoding: 'utf-8', maxBytes: 10000 }, dummyCtx);
      expect(res.success).toBe(true);
      expect(res.data?.bytesRead).toBeGreaterThan(0);
      expect(res.data?.content).toContain('eva-agent');

      const verification = await tool.verify({ path: 'package.json', encoding: 'utf-8', maxBytes: 10000 }, res);
      expect(verification.verified).toBe(true);
      expect(verification.status).toBe('CONFIRMED');
    });

    it('should return recoverable FILE_NOT_FOUND error for non-existent files', async () => {
      const tool = new FileReadTool();
      const res = await tool.execute({ path: 'non_existent_file_xyz.txt', encoding: 'utf-8', maxBytes: 10000 }, dummyCtx);
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('FILE_NOT_FOUND');
      expect(res.error?.category).toBe('recoverable');
    });
  });

  describe('ScreenCaptureTool', () => {
    it('should capture screen and verify file existence and size', async () => {
      const tmpFile = path.join(os.tmpdir(), `test_capture_${Date.now()}.png`);
      const tool = new ScreenCaptureTool({
        capturer: async (dest) => {
          fs.writeFileSync(dest, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); // PNG header
        },
      });

      const res = await tool.execute({ targetPath: tmpFile, displayIndex: 1 }, dummyCtx);
      expect(res.success).toBe(true);
      expect(res.data?.fileSizeBytes).toBe(8);

      const verification = await tool.verify({ targetPath: tmpFile, displayIndex: 1 }, res);
      expect(verification.verified).toBe(true);
      expect(verification.status).toBe('CONFIRMED');

      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    });
  });
});

