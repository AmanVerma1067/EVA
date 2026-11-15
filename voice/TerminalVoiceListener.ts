/**
 * EVA Terminal Voice Listener
 * Provides Spacebar Push-to-Talk and Microphone Speech-to-Text
 * in the macOS terminal using native AVFoundation and Apple Speech Recognition.
 */

import { spawn, execSync, ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rootLogger } from '../core/logger/Logger.js';

export function resolvePackageRoot(): string {
  try {
    const filename = fileURLToPath(import.meta.url);
    const dirname = path.dirname(filename);
    return path.resolve(dirname, '..');
  } catch {
    return process.cwd();
  }
}

export function getDefaultVoiceBinaryPath(): string {
  const pkgRoot = resolvePackageRoot();
  const candidatePkg = path.resolve(pkgRoot, 'bin/eva-voice-capture');
  if (fs.existsSync(candidatePkg)) {
    return candidatePkg;
  }
  const candidateCwd = path.resolve(process.cwd(), 'bin/eva-voice-capture');
  if (fs.existsSync(candidateCwd)) {
    return candidateCwd;
  }
  return candidatePkg;
}

export interface VoiceListenerOptions {
  binaryPath?: string;
  maxRecordingSeconds?: number;
}

export class TerminalVoiceListener {
  private logger = rootLogger.child('voice-listener');
  private binaryPath: string;

  constructor(options?: VoiceListenerOptions) {
    this.binaryPath = options?.binaryPath ?? getDefaultVoiceBinaryPath();
    if (process.platform === 'darwin') {
      this.ensureBinary();
    }
  }

  public getBinaryPath(): string {
    return this.binaryPath;
  }

  /**
   * Ensures the native macOS audio capture & speech recognition binary is compiled.
   */
  public ensureBinary(): boolean {
    if (process.platform !== 'darwin') {
      return false;
    }

    if (fs.existsSync(this.binaryPath)) {
      return true;
    }

    const pkgRoot = resolvePackageRoot();
    let srcPath = path.resolve(pkgRoot, 'bin/eva-voice-capture.m');
    if (!fs.existsSync(srcPath)) {
      const candidateCwd = path.resolve(process.cwd(), 'bin/eva-voice-capture.m');
      if (fs.existsSync(candidateCwd)) {
        srcPath = candidateCwd;
      }
    }

    if (!fs.existsSync(srcPath)) {
      this.logger.warn('Source file eva-voice-capture.m not found', { srcPath });
      return false;
    }

    try {
      this.logger.info('Compiling native macOS eva-voice-capture tool with clang...');
      const binDir = path.dirname(this.binaryPath);
      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
      }

      execSync(
        `clang -fobjc-arc -framework Foundation -framework AVFoundation -framework Speech "${srcPath}" -o "${this.binaryPath}"`,
        { stdio: 'pipe' }
      );
      fs.chmodSync(this.binaryPath, 0o755);
      this.logger.info('Successfully compiled eva-voice-capture binary');
      return true;
    } catch (err) {
      this.logger.error('Failed to compile eva-voice-capture binary', {}, err);
      return false;
    }
  }

  /**
   * Starts a push-to-talk listening session.
   * Returns a handle allowing the caller to stop recording and retrieve the transcription.
   */
  public startListening(callbacks?: {
    onRecordingStarted?: () => void;
    onTranscribing?: () => void;
  }): {
    stop: () => Promise<string>;
    cancel: () => void;
  } {
    if (!this.ensureBinary()) {
      throw new Error('Native voice capture binary is unavailable.');
    }

    let child: ChildProcess | null = null;
    let transcriptResult = '';
    let isStopped = false;

    const childProcess = spawn(this.binaryPath, ['--listen'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child = childProcess;

    const completionPromise = new Promise<string>((resolve) => {
      childProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        if (text.includes('RECORDING_STARTED')) {
          callbacks?.onRecordingStarted?.();
        }
        if (text.includes('TRANSCRIBING')) {
          callbacks?.onTranscribing?.();
        }
        const match = text.match(/TRANSCRIPT:\s*(.*)/);
        if (match) {
          transcriptResult = match[1].trim();
        }
      });

      childProcess.on('close', () => {
        resolve(transcriptResult);
      });

      childProcess.on('error', (err) => {
        this.logger.error('Voice capture process error', {}, err);
        resolve('');
      });
    });

    const stop = async (): Promise<string> => {
      if (isStopped) {
        return transcriptResult;
      }
      isStopped = true;

      try {
        if (child && !child.killed) {
          child.stdin?.write('\n');
          child.stdin?.end();
        }
      } catch {
        // stream might already be closed
      }

      const timeoutPromise = new Promise<string>((res) => setTimeout(() => res(transcriptResult), 10000));
      return Promise.race([completionPromise, timeoutPromise]);
    };

    const cancel = () => {
      isStopped = true;
      if (child && !child.killed) {
        child.kill('SIGINT');
      }
    };

    return { stop, cancel };
  }

  /**
   * Transcribe a pre-existing WAV file.
   */
  public async transcribeFile(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      return '';
    }
    if (!this.ensureBinary()) {
      return '';
    }

    return new Promise((resolve) => {
      const child = spawn(this.binaryPath, ['--transcribe', filePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', () => {
        const match = output.match(/TRANSCRIPT:\s*(.*)/);
        resolve(match ? match[1].trim() : '');
      });

      child.on('error', () => {
        resolve('');
      });
    });
  }
}
