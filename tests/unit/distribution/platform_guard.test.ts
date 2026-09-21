import { describe, expect, it } from 'vitest';
import { PlatformGuard, UnsupportedPlatformError } from '../../../core/distribution/PlatformGuard.js';

describe('PlatformGuard and OS Architecture Boundaries', () => {
  it('accepts macOS on Apple Silicon (darwin arm64)', () => {
    const details = PlatformGuard.assertSupportedPlatform('darwin', 'arm64');
    expect(details.platform).toBe('darwin');
    expect(details.arch).toBe('arm64');
    expect(details.isSupported).toBe(true);
    expect(details.displayName).toContain('Apple Silicon');
  });

  it('accepts macOS on Intel (darwin x64)', () => {
    const details = PlatformGuard.assertSupportedPlatform('darwin', 'x64');
    expect(details.platform).toBe('darwin');
    expect(details.arch).toBe('x64');
    expect(details.isSupported).toBe(true);
    expect(details.displayName).toContain('Intel');
  });

  it('accepts Linux on x64 and arm64', () => {
    const linuxX64 = PlatformGuard.assertSupportedPlatform('linux', 'x64');
    expect(linuxX64.platform).toBe('linux');
    expect(linuxX64.isSupported).toBe(true);

    const linuxArm64 = PlatformGuard.assertSupportedPlatform('linux', 'arm64');
    expect(linuxArm64.platform).toBe('linux');
    expect(linuxArm64.isSupported).toBe(true);
  });

  it('explicitly rejects Windows (win32) with UnsupportedPlatformError', () => {
    expect(() => PlatformGuard.assertSupportedPlatform('win32', 'x64')).toThrow(UnsupportedPlatformError);
    try {
      PlatformGuard.assertSupportedPlatform('win32', 'x64');
    } catch (err: any) {
      expect(err).toBeInstanceOf(UnsupportedPlatformError);
      expect(err.message).toContain('Windows is not supported');
      expect(err.message).toContain('macOS or Linux');
    }
  });

  it('provides platform details without throwing for non-fatal inspection', () => {
    const winDetails = PlatformGuard.getPlatformDetails('win32', 'x64');
    expect(winDetails.isSupported).toBe(false);
    expect(winDetails.platform).toBe('win32');
  });
});
