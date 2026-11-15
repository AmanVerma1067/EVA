import { describe, it, expect, beforeAll } from 'vitest';
import { TerminalVoiceListener } from '../../../voice/TerminalVoiceListener.js';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';

describe('TerminalVoiceListener Native macOS STT & Recording', () => {
  let listener: TerminalVoiceListener;
  const sampleWav = '/tmp/eva_test_unit_speech.wav';

  beforeAll(() => {
    listener = new TerminalVoiceListener();
    // Synthesize a short speech wav
    try {
      execSync(`/usr/bin/say -o ${sampleWav} --data-format=LEI16@16000 "call shivam on whatsapp"`);
    } catch {
      // ignore
    }
  });

  it('should ensure the native voice binary exists', () => {
    const ok = listener.ensureBinary();
    if (process.platform === 'darwin') {
      expect(ok).toBe(true);
    } else {
      expect(ok).toBe(false);
    }
  });

  it('should accurately transcribe speech audio to text', async () => {
    if (!fs.existsSync(sampleWav)) {
      return;
    }
    const transcript = await listener.transcribeFile(sampleWav);
    expect(transcript.toLowerCase()).toContain('call shivam on whatsapp');
  });

  describe('VoiceSystem Natural Human Voice & Instant Interruption', () => {
    it('should default to natural human voice Tara instead of robotic Samantha', async () => {
      const { VoiceSystem } = await import('../../../voice/VoiceSystem.js');
      const voice = new VoiceSystem();
      expect(voice.getVoice()).toBe('Tara');
    });

    it('should allow changing voice dynamically', async () => {
      const { VoiceSystem } = await import('../../../voice/VoiceSystem.js');
      const voice = new VoiceSystem();
      voice.setVoice('Daniel');
      expect(voice.getVoice()).toBe('Daniel');
    });

    it('should support instant stop without throwing', async () => {
      const { VoiceSystem } = await import('../../../voice/VoiceSystem.js');
      const voice = new VoiceSystem({ enabled: true });
      voice.stop();
      expect(voice.isSpeaking()).toBe(false);
    });

    it('should expose no synthesis error after a successful short utterance', async () => {
      const { VoiceSystem } = await import('../../../voice/VoiceSystem.js');
      const voice = new VoiceSystem({ enabled: true, voice: 'Samantha' });
      expect(await voice.speak('EVA test.')).toBe(true);
      expect(voice.getLastError()).toBeNull();
    });
  });
});
