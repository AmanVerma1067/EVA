/**
 * EVA Intent Resolver Engine
 * Conforms to Section 3 of EVA Master Orchestration Spec
 * Resolves normalized speech into high-level structured intent with target and action
 */

import { NormalizedSpeech, ResolvedIntent, IntentType } from './types.js';

export class IntentResolver {
  public resolve(normalized: NormalizedSpeech): ResolvedIntent {
    const text = normalized.cleanedText;
    const lower = text.toLowerCase();

    // 1. Conversational Greetings & Social Chit-Chat
    if (/^(?:hi|hello|hey|yo|sup|good morning|good afternoon|good evening|howdy)(?:\s+eva)?$/i.test(lower)) {
      return {
        intent: 'CONVERSATIONAL_GREETING',
        rawTarget: 'eva',
        action: 'greet',
        qualifiers: normalized.strippedQualifiers,
        confidence: 0.99,
      };
    }

    // 2. System Capability & Identity Inquiries
    if (
      /^(?:who are you|what are you|what can you do|what is eva|introduce yourself|tell me about yourself|who made you|who created you|who built you)\b/i.test(lower) ||
      /^(?:how are you|how are you doing|hows it going|how are things)\b/i.test(lower) ||
      /^(?:help|help me|can you help me)\b/i.test(lower) ||
      /^(?:thank you|thanks|thx|great job|awesome)\b/i.test(lower) ||
      /^(?:bye|goodbye|see you|cya)\b/i.test(lower)
    ) {
      return {
        intent: 'SYSTEM_CAPABILITY_INQUIRY',
        rawTarget: 'eva',
        action: 'explain_capabilities',
        qualifiers: normalized.strippedQualifiers,
        confidence: 0.98,
      };
    }

    // 3. Project Discovery / Inquiry
    if (/^(?:what projects (?:do i have|are on my desktop)|list (?:my )?projects|show (?:my )?projects|what(?:'s| is) on (?:my )?desktop)\b/i.test(lower)) {
      return {
        intent: 'SYSTEM_CAPABILITY_INQUIRY',
        rawTarget: 'projects',
        action: 'list_desktop_projects',
        qualifiers: normalized.strippedQualifiers,
        confidence: 0.98,
      };
    }

    // 4. Past Output / Claude Execution Inquiries
    const isQuestion =
      /^(?:what|how|why|where|when|who|which|did|is|was|tell me|show me|let me know)\b/i.test(lower) ||
      text.endsWith('?') ||
      /\b(?:what was|what did|what is|tell me what|show me what|what happened|let me know about)\b/i.test(lower);

    if (
      isQuestion &&
      (lower.includes('claude') ||
        lower.includes('response') ||
        lower.includes('output') ||
        lower.includes('review') ||
        lower.includes('result') ||
        lower.includes('say') ||
        lower.includes('said') ||
        lower.includes('last command') ||
        lower.includes('last action'))
    ) {
      return {
        intent: 'QUERY_PREVIOUS_RESULT',
        rawTarget: lower.includes('claude') ? 'claude' : 'previous_tool',
        action: 'query_execution_output',
        qualifiers: normalized.strippedQualifiers,
        confidence: 0.96,
      };
    }

    // 5. Strategic Planning Directive ("plan the return system", "act as a planner and plan this", "act as a planner: plan X")
    if (/^(?:plan|act as (?:a |the )?planner(?::|\s+and)?|create a plan for)\s+(.+)/i.test(lower)) {
      const match = text.match(/^(?:plan|act as (?:a |the )?planner(?::|\s+and)?|create a plan for)\s+(.+)/i);
      const planTarget = match ? match[1].replace(/^(?:plan\s+)?(?:the\s+)?/i, '').trim() : text;
      return {
        intent: 'STRATEGIC_PLANNING',
        rawTarget: planTarget,
        action: 'plan_architecture',
        qualifiers: normalized.strippedQualifiers,
        confidence: 0.97,
      };
    }

    // 6. Mac System Diagnostics ("how is my mac doing", "battery status", "heating", "running apps")
    if (
      lower.includes('mac status') ||
      lower.includes('system status') ||
      lower.includes('battery') ||
      lower.includes('charging') ||
      lower.includes('heating') ||
      lower.includes('temperature') ||
      lower.includes('how is my mac') ||
      lower.includes('hows my mac') ||
      lower.includes('what apps are open') ||
      lower.includes('what apps are running')
    ) {
      return {
        intent: 'SYSTEM_HEALTH_DIAGNOSTICS',
        rawTarget: 'mac_system',
        action: 'inspect_health',
        qualifiers: normalized.strippedQualifiers,
        confidence: 0.98,
      };
    }

    // 7. Communication (WhatsApp Call / Message)
    if (lower.includes('whatsapp') || lower.includes('call ') || lower.includes('message ')) {
      const isCall = lower.includes('call') || lower.includes('facetime');
      const isVideo = lower.includes('video call');
      const callMatch = text.match(/(?:call|calling|video call)\s+(?:to\s+)?([a-zA-Z0-9 ._-]+?)(?:\s+(?:on|via)\s+whatsapp)?$/i);
      const recipient = callMatch && callMatch[1] ? callMatch[1].replace(/\bwhatsapp\b/gi, '').trim() : 'contact';
      return {
        intent: 'COMMUNICATION_CALL',
        rawTarget: recipient,
        action: isVideo ? 'video_call' : 'voice_call',
        qualifiers: normalized.strippedQualifiers,
        confidence: 0.95,
      };
    }

    // 8. Media Playback (YouTube)
    if (
      lower.includes('youtube') ||
      lower.includes('play a song') ||
      lower.includes('playing music') ||
      ((lower.startsWith('play ') || lower.startsWith('playing ')) && !lower.includes('project'))
    ) {
      const queryMatch = text.match(/(?:play|playing|search for)\s+['"]?(.+?)['"]?(?:\s+(?:on|in)\s+youtube)?$/i);
      const mediaQuery = queryMatch && queryMatch[1] ? queryMatch[1].replace(/\s+(?:on|in)\s+youtube$/i, '').trim() : 'trending music';
      return {
        intent: 'MEDIA_PLAYBACK',
        rawTarget: mediaQuery,
        action: 'play_youtube',
        qualifiers: normalized.strippedQualifiers,
        confidence: 0.95,
      };
    }

    // 9. Open Project in VS Code
    const openInVSCode =
      (lower.includes('open') || lower.includes('launch')) &&
      (/\b(?:in|with)\s+(?:vs\s*code|vscode|visual\s+studio\s+code|code)\b/i.test(lower) ||
        /\b(?:vs\s*code|vscode|visual\s+studio\s+code)\s+(?:on|for)\s+/i.test(lower));

    if (openInVSCode) {
      const projMatch = text.match(/(?:open|launch)\s+(?:project\s+)?([a-zA-Z0-9_-]+)(?:\s+in\s+(?:vs\s*code|vscode|code|visual\s+studio\s+code))/i)
        || text.match(/(?:open|launch)\s+(?:vs\s*code|vscode|code|visual\s+studio\s+code)\s+(?:on|for)\s+([a-zA-Z0-9_-]+)/i);
      const projName = projMatch && projMatch[1] ? projMatch[1].trim() : 'current_workspace';
      return {
        intent: 'OPEN_PROJECT_IN_EDITOR',
        rawTarget: projName,
        action: 'open_in_vscode',
        qualifiers: normalized.strippedQualifiers,
        confidence: 0.97,
      };
    }

    // 10. Code Review with Claude
    if (!isQuestion && lower.includes('review') && lower.includes('claude')) {
      return {
        intent: 'REVIEW_CODEBASE',
        rawTarget: 'claude',
        action: 'automated_review',
        qualifiers: normalized.strippedQualifiers,
        confidence: 0.96,
      };
    }

    // 11. Developer Task execution with Claude
    if (
      !isQuestion &&
      (lower.includes('complete task') ||
        lower.includes('ask claude to') ||
        lower.includes('tell claude to') ||
        (lower.includes('claude') && (lower.includes('for this project') || lower.includes('for project') || lower.includes('on this project'))) ||
        (lower.includes('claude') && (lower.includes('fix') || lower.includes('build') || lower.includes('code'))))
    ) {
      const taskMatch = text.match(/(?:ask claude to|tell claude to|complete task)\s+(.+)/i);
      const taskDesc = taskMatch ? taskMatch[1].trim() : text;
      return {
        intent: 'RUN_DEVELOPER_TASK',
        rawTarget: taskDesc,
        action: 'execute_claude_task',
        qualifiers: normalized.strippedQualifiers,
        confidence: 0.94,
      };
    }

    // 12. Close Application or Window ("close terminal", "quit chrome", "close window")
    if (lower.startsWith('close ') || lower.startsWith('quit ') || lower.startsWith('exit ')) {
      const targetApp = text.replace(/^(?:close|quit|exit)\s+(?:the\s+)?(?:window\s+of\s+|window\s+|app\s+)?/i, '').trim();
      return {
        intent: 'CLOSE_APPLICATION',
        rawTarget: targetApp || 'current application',
        action: 'close_app',
        qualifiers: normalized.strippedQualifiers,
        confidence: 0.97,
      };
    }

    // 13. Check Application Running Status ("is Finder running", "status of Chrome")
    if (lower.includes('running') || lower.includes('status of') || lower.startsWith('is ') || lower.startsWith('check if ')) {
      const statusMatch = text.match(/^(?:is|check if|status of)\s+(.+?)(?:\s+(?:is\s+)?(?:currently\s+)?(?:running|open|active))?[.?]?$/i);
      if (statusMatch && statusMatch[1]) {
        return {
          intent: 'CHECK_APPLICATION_STATUS',
          rawTarget: statusMatch[1].trim(),
          action: 'check_running_status',
          qualifiers: normalized.strippedQualifiers,
          confidence: 0.95,
        };
      }
    }

    // 14. Web Navigation / Search ("open firebase in chrome", "open github.com")
    const inBrowserMatch = text.match(/^(?:open|launch)\s+(.+?)\s+(?:in|with)\s+(chrome|safari|firefox|brave|browser)/i);
    if (inBrowserMatch) {
      return {
        intent: 'WEB_SEARCH_OR_NAVIGATE',
        rawTarget: inBrowserMatch[1].trim(),
        action: 'navigate_browser',
        qualifiers: normalized.strippedQualifiers,
        metadata: { browser: inBrowserMatch[2].trim() },
        confidence: 0.95,
      };
    }

    // 15. General Application Open ("open antigravity", "launch calculator", "open vs code", "open terminal")
    if (lower.startsWith('open ') || lower.startsWith('launch ') || lower.startsWith('start ') || lower.startsWith('get ') && lower.endsWith(' up')) {
      let candidate = text.replace(/^(?:open|launch|start)\s+/i, '').trim();
      if (candidate.startsWith('get ') && candidate.endsWith(' up')) {
        candidate = candidate.replace(/^get\s+/i, '').replace(/\s+up$/i, '').trim();
      }
      return {
        intent: 'OPEN_APPLICATION',
        rawTarget: candidate,
        action: 'launch_application',
        qualifiers: normalized.strippedQualifiers,
        confidence: 0.95,
      };
    }

    // Default: Unknown / General
    return {
      intent: 'UNKNOWN',
      rawTarget: text,
      action: 'process_general',
      qualifiers: normalized.strippedQualifiers,
      confidence: 0.5,
    };
  }
}
