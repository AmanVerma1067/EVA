import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { FileReadTool } from '../../tools/filesystem/FileReadTool.js';
import { ExecutionContext } from '../../core/tools/ToolContract.js';

describe('Security Test: Filesystem Path Traversal Defense', () => {
  const workspaceRoot = path.join(os.tmpdir(), 'eva_test_workspace');
  const dummyCtx: ExecutionContext = {
    taskId: 'sec-task-1',
    sessionId: 'sec-sess-1',
    deviceId: 'sec-dev-1',
    workspaceRoot,
    abortSignal: new AbortController().signal,
  };

  const fileReadTool = new FileReadTool();

  it('should block directory traversal using ../../../../', async () => {
    const maliciousPaths = [
      '../../../../etc/passwd',
      'foo/bar/../../../../../../etc/hosts',
      '/etc/passwd',
      '..\\..\\..\\windows\\system32',
    ];

    for (const p of maliciousPaths) {
      const result = await fileReadTool.execute({ path: p, encoding: 'utf-8', maxBytes: 1024 }, dummyCtx);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PATH_TRAVERSAL_DETECTED');
      expect(result.error?.category).toBe('security-related');
    }
  });
});

