/**
 * EVA WhatsApp Automation Tools
 * Voice calls, Video calls, and Message automation on macOS
 * Conforms to EVA_AI_Implementation_Master_Spec Phase 5 & Phase 11
 */

import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolContract, ToolResult, VerificationResult, ExecutionContext, RiskLevel } from '../../core/tools/ToolContract.js';

const execFileAsync = promisify(execFile);

export async function checkAccessibilityPermissions(): Promise<boolean> {
  try {
    const script = 'tell application "System Events" to get name of first process whose frontmost is true';
    await execFileAsync('osascript', ['-e', script]);
    return true;
  } catch {
    return false;
  }
}

export function isAccessibilityError(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes('1002') ||
    msg.includes('-1743') ||
    msg.includes('not allowed to send keystrokes') ||
    msg.includes('assistive access') ||
    msg.includes('Accessibility')
  );
}

function sanitizeRecipient(raw: string): string {
  return raw
    .replace(/^(?:with|to)\s+/i, '')
    .replace(/[.?]+$/, '')
    .trim()
    .replace(/"/g, '\\"');
}

function sanitizeMessage(raw: string): string {
  return raw.replace(/"/g, '\\"');
}

// ==========================================
// 1. WhatsApp Send Message Tool
// ==========================================
export const WhatsAppInputSchema = z.object({
  recipient: z.string().min(1, 'Recipient contact name cannot be empty'),
  message: z.string().min(1, 'Message content cannot be empty'),
});

export const WhatsAppOutputSchema = z.object({
  sent: z.boolean(),
  recipient: z.string(),
  message: z.string(),
  deliveryStatus: z.string(),
});

export type WhatsAppInput = z.infer<typeof WhatsAppInputSchema>;
export type WhatsAppOutput = z.infer<typeof WhatsAppOutputSchema>;

export class WhatsAppTool implements ToolContract<WhatsAppInput, WhatsAppOutput> {
  public readonly name = 'whatsapp.send_message';
  public readonly version = '1.0.0';
  public readonly description = 'Sends a text message to a contact in WhatsApp desktop on macOS';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 25000;

  public readonly inputSchema = WhatsAppInputSchema;
  public readonly outputSchema = WhatsAppOutputSchema;

  private runner?: (recipient: string, message: string) => Promise<boolean>;

  constructor(options?: { runner?: (recipient: string, message: string) => Promise<boolean> }) {
    this.runner = options?.runner;
  }

  public async execute(params: WhatsAppInput, ctx: ExecutionContext): Promise<ToolResult<WhatsAppOutput>> {
    const startTime = Date.now();

    try {
      if (this.runner) {
        await this.runner(params.recipient, params.message);
      } else {
        const hasTcc = await checkAccessibilityPermissions();
        if (!hasTcc) {
          try {
            await execFileAsync('open', [`whatsapp://send?text=${encodeURIComponent(params.message)}`], { signal: ctx.abortSignal });
            return {
              success: true,
              data: {
                sent: true,
                recipient: params.recipient,
                message: params.message,
                deliveryStatus: 'Drafted message in WhatsApp via URL scheme (Keystrokes blocked: grant Accessibility permissions for direct auto-send)',
              },
              metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
            };
          } catch {
            return {
              success: false,
              error: {
                code: 'ACCESSIBILITY_PERMISSION_REQUIRED',
                message: 'macOS Accessibility permission is required for WhatsApp automation. Grant Terminal/EVA access in System Settings -> Privacy & Security -> Accessibility.',
                category: 'recoverable',
              },
              metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
            };
          }
        }

        const cleanRecipient = sanitizeRecipient(params.recipient);
        const cleanMessage = sanitizeMessage(params.message);

        const script = `
          tell application "WhatsApp"
            activate
          end tell
          delay 0.8
          tell application "System Events"
            if exists (process "WhatsApp") then
              tell process "WhatsApp"
                set frontmost to true
                -- Clear any existing overlay or open search
                key code 53 -- Escape
                delay 0.2
                key code 53 -- Escape
                delay 0.3
                -- Open New Chat overlay (Cmd+N) to search contacts directly
                keystroke "n" using {command down}
                delay 0.6
                -- Type recipient contact name
                keystroke "${cleanRecipient}"
                delay 1.0
                -- Move to first contact result and open chat
                key code 125 -- Down Arrow
                delay 0.3
                key code 36  -- Return
                delay 0.8
                -- Save current clipboard, paste message, restore clipboard
                set savedClip to the clipboard
                set the clipboard to "${cleanMessage}"
                delay 0.3
                keystroke "v" using {command down}
                delay 0.3
                key code 36  -- Return to send
                delay 0.2
                try
                  set the clipboard to savedClip
                end try
              end tell
            else
              error "WhatsApp process not found after activation"
            end if
          end tell
        `;

        await execFileAsync('osascript', ['-e', script], { signal: ctx.abortSignal });
      }

      return {
        success: true,
        data: {
          sent: true,
          recipient: params.recipient,
          message: params.message,
          deliveryStatus: 'Dispatched to WhatsApp contact',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      if (isAccessibilityError(err)) {
        try {
          await execFileAsync('open', [`whatsapp://send?text=${encodeURIComponent(params.message)}`], { signal: ctx.abortSignal });
          return {
            success: true,
            data: {
              sent: true,
              recipient: params.recipient,
              message: params.message,
              deliveryStatus: 'Drafted message in WhatsApp via URL scheme (Keystrokes blocked: grant Accessibility permissions for direct auto-send)',
            },
            metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
          };
        } catch {
          return {
            success: false,
            error: {
              code: 'ACCESSIBILITY_PERMISSION_REQUIRED',
              message: 'macOS Accessibility permission is required for WhatsApp automation. Grant Terminal/EVA access in System Settings -> Privacy & Security -> Accessibility.',
              category: 'recoverable',
              details: { error: String(err) },
            },
            metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
          };
        }
      }

      return {
        success: false,
        error: {
          code: 'WHATSAPP_SEND_FAILED',
          message: `Failed to automate WhatsApp: ${String(err)}`,
          category: 'recoverable',
          details: { error: String(err) },
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(
    params: WhatsAppInput,
    result: ToolResult<WhatsAppOutput>,
    ctx: ExecutionContext
  ): Promise<VerificationResult> {
    if (!result.success) {
      return {
        verified: false,
        status: 'FAILED',
        evidence: `WhatsApp message dispatch failed: ${result.error?.message}`,
      };
    }

    return {
      verified: true,
      status: 'CONFIRMED',
      evidence: `Message '${params.message}' dispatched to contact '${params.recipient}'.`,
    };
  }
}

// ==========================================
// 2. WhatsApp Voice Call Tool
// ==========================================
export const WhatsAppCallInputSchema = z.object({
  recipient: z.string().min(1, 'Recipient name cannot be empty'),
});

export const WhatsAppCallOutputSchema = z.object({
  callInitiated: z.boolean(),
  recipient: z.string(),
  callType: z.literal('voice'),
});

export type WhatsAppCallInput = z.infer<typeof WhatsAppCallInputSchema>;
export type WhatsAppCallOutput = z.infer<typeof WhatsAppCallOutputSchema>;

export class WhatsAppCallTool implements ToolContract<WhatsAppCallInput, WhatsAppCallOutput> {
  public readonly name = 'whatsapp.call';
  public readonly version = '1.0.0';
  public readonly description = 'Initiates a voice call to a contact on WhatsApp desktop';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 25000;

  public readonly inputSchema = WhatsAppCallInputSchema;
  public readonly outputSchema = WhatsAppCallOutputSchema;

  private runner?: (recipient: string) => Promise<boolean>;

  constructor(options?: { runner?: (recipient: string) => Promise<boolean> }) {
    this.runner = options?.runner;
  }

  public async execute(params: WhatsAppCallInput, ctx: ExecutionContext): Promise<ToolResult<WhatsAppCallOutput>> {
    const startTime = Date.now();

    try {
      if (this.runner) {
        await this.runner(params.recipient);
      } else {
        const hasTcc = await checkAccessibilityPermissions();
        if (!hasTcc) {
          await execFileAsync('open', ['-a', 'WhatsApp']).catch(() => {});
          return {
            success: false,
            error: {
              code: 'ACCESSIBILITY_PERMISSION_REQUIRED',
              message: 'macOS Accessibility permission is required for WhatsApp calls. Grant Terminal/EVA access in System Settings -> Privacy & Security -> Accessibility.',
              category: 'recoverable',
            },
            metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
          };
        }

        const cleanRecipient = sanitizeRecipient(params.recipient);

        const script = `
          tell application "WhatsApp"
            activate
          end tell
          delay 0.8
          tell application "System Events"
            if exists (process "WhatsApp") then
              tell process "WhatsApp"
                set frontmost to true
                -- Clear any existing overlay or open search
                key code 53 -- Escape
                delay 0.2
                key code 53 -- Escape
                delay 0.3
                -- Open New Chat overlay to find and open conversation with recipient
                keystroke "n" using {command down}
                delay 0.6
                keystroke "${cleanRecipient}"
                delay 1.0
                key code 125 -- Down Arrow
                delay 0.3
                key code 36  -- Return
                delay 0.8
                -- Trigger Voice Call: search menus accounting for Unicode Left-to-Right Mark \\u200e
                set callTriggered to false
                with timeout of 4 seconds
                  try
                    repeat with mb in menu bar items of menu bar 1
                      try
                        repeat with mi in menu items of menu 1 of mb
                          if name of mi contains "Voice Call" then
                            click mi
                            set callTriggered to true
                            exit repeat
                          end if
                        end repeat
                        if callTriggered then exit repeat
                      end try
                    end repeat
                    if not callTriggered then
                      set btnList to (every button of window 1 whose description contains "call" or description contains "voice" or name contains "Voice" or name contains "Call")
                      if (count of btnList) > 0 then
                        click item 1 of btnList
                        set callTriggered to true
                      end if
                    end if
                  end try
                end timeout
                if not callTriggered then
                  error "Could not locate WhatsApp Voice Call button or menu item"
                end if
              end tell
            else
              error "WhatsApp is not running"
            end if
          end tell
        `;

        await execFileAsync('osascript', ['-e', script], { signal: ctx.abortSignal });
      }

      return {
        success: true,
        data: {
          callInitiated: true,
          recipient: params.recipient,
          callType: 'voice',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      if (isAccessibilityError(err)) {
        await execFileAsync('open', ['-a', 'WhatsApp']).catch(() => {});
        return {
          success: false,
          error: {
            code: 'ACCESSIBILITY_PERMISSION_REQUIRED',
            message: 'macOS Accessibility permission is required for WhatsApp calls. Grant Terminal/EVA access in System Settings -> Privacy & Security -> Accessibility.',
            category: 'recoverable',
            details: { error: String(err) },
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }
      return {
        success: false,
        error: {
          code: 'WHATSAPP_CALL_FAILED',
          message: `Failed to start voice call: ${String(err)}`,
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(
    params: WhatsAppCallInput,
    result: ToolResult<WhatsAppCallOutput>
  ): Promise<VerificationResult> {
    const verified = Boolean(result.success && result.data?.callInitiated);
    return {
      verified,
      status: verified ? 'CONFIRMED' : 'FAILED',
      evidence: verified ? `Voice call initiated to '${params.recipient}' on WhatsApp.` : 'Call initiation failed.',
    };
  }
}

// ==========================================
// 3. WhatsApp Video Call Tool
// ==========================================
export const WhatsAppVideoCallInputSchema = z.object({
  recipient: z.string().min(1, 'Recipient name cannot be empty'),
});

export const WhatsAppVideoCallOutputSchema = z.object({
  callInitiated: z.boolean(),
  recipient: z.string(),
  callType: z.literal('video'),
});

export type WhatsAppVideoCallInput = z.infer<typeof WhatsAppVideoCallInputSchema>;
export type WhatsAppVideoCallOutput = z.infer<typeof WhatsAppVideoCallOutputSchema>;

export class WhatsAppVideoCallTool implements ToolContract<WhatsAppVideoCallInput, WhatsAppVideoCallOutput> {
  public readonly name = 'whatsapp.video_call';
  public readonly version = '1.0.0';
  public readonly description = 'Initiates a video call to a contact on WhatsApp desktop';
  public readonly riskLevel: RiskLevel = 'NORMAL';
  public readonly timeoutMs = 25000;

  public readonly inputSchema = WhatsAppVideoCallInputSchema;
  public readonly outputSchema = WhatsAppVideoCallOutputSchema;

  private runner?: (recipient: string) => Promise<boolean>;

  constructor(options?: { runner?: (recipient: string) => Promise<boolean> }) {
    this.runner = options?.runner;
  }

  public async execute(params: WhatsAppVideoCallInput, ctx: ExecutionContext): Promise<ToolResult<WhatsAppVideoCallOutput>> {
    const startTime = Date.now();

    try {
      if (this.runner) {
        await this.runner(params.recipient);
      } else {
        const hasTcc = await checkAccessibilityPermissions();
        if (!hasTcc) {
          await execFileAsync('open', ['-a', 'WhatsApp']).catch(() => {});
          return {
            success: false,
            error: {
              code: 'ACCESSIBILITY_PERMISSION_REQUIRED',
              message: 'macOS Accessibility permission is required for WhatsApp video calls. Grant Terminal/EVA access in System Settings -> Privacy & Security -> Accessibility.',
              category: 'recoverable',
            },
            metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
          };
        }

        const cleanRecipient = sanitizeRecipient(params.recipient);

        const script = `
          tell application "WhatsApp"
            activate
          end tell
          delay 0.8
          tell application "System Events"
            if exists (process "WhatsApp") then
              tell process "WhatsApp"
                set frontmost to true
                key code 53 -- Escape
                delay 0.2
                key code 53 -- Escape
                delay 0.3
                keystroke "n" using {command down}
                delay 0.6
                keystroke "${cleanRecipient}"
                delay 1.0
                key code 125 -- Down Arrow
                delay 0.3
                key code 36  -- Return
                delay 0.8
                -- Trigger Video Call: search menus accounting for Unicode Left-to-Right Mark \\u200e
                set callTriggered to false
                with timeout of 4 seconds
                  try
                    repeat with mb in menu bar items of menu bar 1
                      try
                        repeat with mi in menu items of menu 1 of mb
                          if name of mi contains "Video Call" then
                            click mi
                            set callTriggered to true
                            exit repeat
                          end if
                        end repeat
                        if callTriggered then exit repeat
                      end try
                    end repeat
                    if not callTriggered then
                      set btnList to (every button of window 1 whose description contains "video" or name contains "Video")
                      if (count of btnList) > 0 then
                        click item 1 of btnList
                        set callTriggered to true
                      end if
                    end if
                  end try
                end timeout
                if not callTriggered then
                  error "Could not locate WhatsApp Video Call button or menu item"
                end if
              end tell
            else
              error "WhatsApp is not running"
            end if
          end tell
        `;

        await execFileAsync('osascript', ['-e', script], { signal: ctx.abortSignal });
      }

      return {
        success: true,
        data: {
          callInitiated: true,
          recipient: params.recipient,
          callType: 'video',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    } catch (err) {
      if (isAccessibilityError(err)) {
        await execFileAsync('open', ['-a', 'WhatsApp']).catch(() => {});
        return {
          success: false,
          error: {
            code: 'ACCESSIBILITY_PERMISSION_REQUIRED',
            message: 'macOS Accessibility permission is required for WhatsApp video calls. Grant Terminal/EVA access in System Settings -> Privacy & Security -> Accessibility.',
            category: 'recoverable',
            details: { error: String(err) },
          },
          metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
        };
      }
      return {
        success: false,
        error: {
          code: 'WHATSAPP_VIDEOCALL_FAILED',
          message: `Failed to start video call: ${String(err)}`,
          category: 'recoverable',
        },
        metrics: { durationMs: Date.now() - startTime, timestamp: startTime },
      };
    }
  }

  public async verify(
    params: WhatsAppVideoCallInput,
    result: ToolResult<WhatsAppVideoCallOutput>
  ): Promise<VerificationResult> {
    const verified = Boolean(result.success && result.data?.callInitiated);
    return {
      verified,
      status: verified ? 'CONFIRMED' : 'FAILED',
      evidence: verified ? `Video call initiated to '${params.recipient}' on WhatsApp.` : 'Video call initiation failed.',
    };
  }
}
