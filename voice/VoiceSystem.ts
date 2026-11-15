/**
 * EVA Voice System — Speech Synthesis (TTS) & Audio Feedback
 * Conforms to EVA_AI_Implementation_Master_Spec Phase 4
 */

import * as fs from 'node:fs';
import { ChildProcess, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface VoiceOptions {
  voice?: string; // e.g. "Samantha", "Alex", "Daniel"
  rate?: number; // words per minute (e.g. 180)
  enabled?: boolean;
}

export class VoiceSystem {
  private voice: string;
  private rate: number;
  private enabled: boolean;
  private currentProcess: ChildProcess | null = null;
  private lastError: string | null = null;

  constructor(options?: VoiceOptions) {
    this.voice = options?.voice ?? 'Tara'; // Upgraded from robotic Samantha to natural human voice Tara
    this.rate = options?.rate ?? 180;
    this.enabled = options?.enabled ?? true;
  }

  public setVoice(voice: string): void {
    this.voice = voice;
  }

  public getVoice(): string {
    return this.voice;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isSpeaking(): boolean {
    return this.currentProcess !== null;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Instantly terminates any ongoing speech synthesis process
   */
  public stop(): void {
    if (this.currentProcess) {
      try {
        this.currentProcess.kill('SIGKILL');
      } catch {
        // Ignored
      }
      this.currentProcess = null;
    }
    // Do not use a process-wide `killall say` here: its asynchronous execution
    // can race with the next utterance and terminate EVA's newly spawned voice.
  }

  public async speak(text: string): Promise<boolean> {
    if (!this.enabled) return false;
    this.lastError = null;

    // Stop any currently playing speech before starting new utterance
    this.stop();

    // Clean text: strip markdown characters, code blocks, URLs
    const sanitized = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/https?:\/\/\S+/g, 'link')
      .replace(/[*_#~]/g, '')
      .trim();

    if (!sanitized) return false;

    return new Promise<boolean>((resolve) => {
      try {
        let cmd = '/usr/bin/say';
        let args = ['-v', this.voice, '-r', this.rate.toString(), sanitized];

        if (process.platform === 'linux') {
          if (fs.existsSync('/usr/bin/spd-say')) {
            cmd = '/usr/bin/spd-say';
            args = [sanitized];
          } else if (fs.existsSync('/usr/bin/espeak')) {
            cmd = '/usr/bin/espeak';
            args = [sanitized];
          } else {
            resolve(true);
            return;
          }
        } else if (!fs.existsSync(cmd)) {
          resolve(true);
          return;
        }

        const child = spawn(cmd, args);
        this.currentProcess = child;

        child.on('close', (code) => {
          if (this.currentProcess === child) {
            this.currentProcess = null;
          }
          if (code !== 0 && code !== null) {
            this.lastError = `Speech synthesis exited with code ${code ?? 'unknown'}.`;
          }
          resolve(code === 0 || code === null);
        });

        child.on('error', (error) => {
          if (this.currentProcess === child) {
            this.currentProcess = null;
          }
          this.lastError = `Unable to start speech synthesis: ${error.message}`;
          resolve(false);
        });
      } catch {
        this.currentProcess = null;
        this.lastError = 'Unable to start speech synthesis.';
        resolve(false);
      }
    });
  }

  public async getAvailableVoices(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('/usr/bin/say', ['-v', '?']);
      return stdout
        .split('\n')
        .map((line) => line.split(/\s{2,}/)[0]?.trim())
        .filter(Boolean);
    } catch {
      return ['Samantha', 'Alex'];
    }
  }
}
