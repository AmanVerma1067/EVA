/**
 * EVA Platform Guard
 * Conforms to Section 3 & 4 of EVA Product Architecture, Distribution & Launch Spec
 * Enforces operating system and CPU architecture boundaries.
 * Explicitly rejects Windows cleanly without partial state.
 */

export class UnsupportedPlatformError extends Error {
  public readonly code = 'UNSUPPORTED_PLATFORM';
  public readonly platform: string;
  public readonly arch: string;

  constructor(platform: string, arch: string, message?: string) {
    super(
      message ??
        `Operating system '${platform}' (${arch}) is not supported. EVA requires macOS (Apple Silicon or Intel) or Linux. Windows is explicitly unsupported.`
    );
    this.name = 'UnsupportedPlatformError';
    this.platform = platform;
    this.arch = arch;
  }
}

export type SupportedPlatform = 'darwin' | 'linux';
export type SupportedArch = 'arm64' | 'x64';

export interface PlatformDetails {
  platform: string;
  arch: string;
  isMacOS: boolean;
  isLinux: boolean;
  isWindows: boolean;
  isAppleSilicon: boolean;
  isSupported: boolean;
  displayName: string;
}

export class PlatformGuard {
  private static SUPPORTED_PLATFORMS: Set<string> = new Set(['darwin', 'linux']);
  private static SUPPORTED_ARCHS: Set<string> = new Set(['arm64', 'x64']);

  /**
   * Returns metadata regarding the host operating system and CPU architecture
   */
  public static getPlatformDetails(
    customPlatform?: string,
    customArch?: string
  ): PlatformDetails {
    const platform = customPlatform ?? process.platform;
    const arch = customArch ?? process.arch;

    const isMacOS = platform === 'darwin';
    const isLinux = platform === 'linux';
    const isWindows = platform === 'win32';
    const isAppleSilicon = isMacOS && arch === 'arm64';
    const isSupported = this.SUPPORTED_PLATFORMS.has(platform) && this.SUPPORTED_ARCHS.has(arch);

    let displayName = `${platform} (${arch})`;
    if (isMacOS) {
      displayName = isAppleSilicon ? 'macOS (Apple Silicon)' : 'macOS (Intel)';
    } else if (isLinux) {
      displayName = `Linux (${arch})`;
    } else if (isWindows) {
      displayName = 'Microsoft Windows (Unsupported)';
    }

    return {
      platform,
      arch,
      isMacOS,
      isLinux,
      isWindows,
      isAppleSilicon,
      isSupported,
      displayName,
    };
  }

  /**
   * Asserts that the current host machine is a supported operating environment.
   * Throws UnsupportedPlatformError if run on Windows or an unsupported OS.
   */
  public static assertSupportedPlatform(
    customPlatform?: string,
    customArch?: string
  ): PlatformDetails {
    const details = this.getPlatformDetails(customPlatform, customArch);

    if (details.isWindows || !details.isSupported) {
      throw new UnsupportedPlatformError(
        details.platform,
        details.arch,
        details.isWindows
          ? 'Windows is not supported. EVA requires macOS or Linux. Installation and execution aborted to protect system integrity.'
          : `Platform '${details.platform}' with architecture '${details.arch}' is not currently supported by EVA.`
      );
    }

    return details;
  }

  public static isSupported(customPlatform?: string, customArch?: string): boolean {
    const details = this.getPlatformDetails(customPlatform, customArch);
    return details.isSupported;
  }
}

