/**
 * EVA Prompt Enhancement Engine
 * Transforms casual, conversational, and spoken voice transcripts
 * into high-precision, structured, and optimized agent instructions.
 */

import { normalizeMacAppName } from '../../tools/application/AppLaunchTool.js';

export interface EnhancedPromptResult {
  originalText: string;
  enhancedPrompt: string;
  intentCategory: 'CALL' | 'MESSAGE' | 'APP_CONTROL' | 'DEVELOPER' | 'SYSTEM' | 'GENERAL' | 'BROWSER';
  entities: {
    recipient?: string;
    message?: string;
    appName?: string;
    filePath?: string;
    taskDescription?: string;
    url?: string;
    callType?: 'voice' | 'video';
  };
  refinements: string[];
}

const FILLER_WORDS = [
  /^(?:hey|hi|yo|ok|okay|hello|eva)\s+/i,
  /\b(?:can you|could you|please|would you|i want you to|i'd like you to|help me|just|real quick|for me|now)\b/gi,
  /\b(?:uh|um|er|ah|like|you know)\b/gi,
];

// Regex detecting URLs, domains, or web addresses
export const WEB_DOMAIN_REGEX = /\b(?:https?:\/\/|www\.)?[a-zA-Z0-9-]+\.(?:com|org|net|io|dev|app|ai|co|in|edu|gov|me|info|xyz|tech|html)(?:\/[^\s]*)?\b/i;

export function mentionsVSCode(text: string): boolean {
  const lower = text.toLowerCase();
  if (/\b(?:vs\s*code|vscode|visual\s+studio\s+code)\b/i.test(lower)) return true;
  const withoutClaude = lower.replace(/\bclaude(?:\s+code)?\b/gi, '').trim();
  return /\b(?:in|into|with|using|open)\s+code\b/i.test(withoutClaude) || /\bcode\s+(?:editor|ide)\b/i.test(withoutClaude);
}

export class PromptEnhancer {
  /**
   * Enhances raw transcribed voice or casual text input into an optimal prompt
   */
  public enhance(rawInput: string): EnhancedPromptResult {
    const original = rawInput.trim();
    let cleaned = original;
    const refinements: string[] = [];

    // 1. Remove conversational filler phrases
    for (const pattern of FILLER_WORDS) {
      if (pattern.test(cleaned)) {
        const candidate = cleaned.replace(pattern, ' ').replace(/\s{2,}/g, ' ').trim();
        if (candidate.length > 0 && !/^[?.!, ]+$/.test(candidate)) {
          cleaned = candidate;
          refinements.push('Stripped conversational fillers & speech hesitations');
        }
      }
    }

    const lower = cleaned.toLowerCase();
    const entities: EnhancedPromptResult['entities'] = {};

    const isQuestion =
      /^(?:what|how|why|where|when|who|which|did|is|was|tell me|show me)\b/i.test(cleaned) ||
      cleaned.endsWith('?') ||
      /\b(?:what was|what did|what is|tell me what|show me what|what were|what happened)\b/i.test(cleaned);

    // 0a. Intent: Conversational Greetings & Social Chit-Chat ("hi", "hello", "good morning", "how are you", "who are you")
    const isGreeting = /^(?:hi|hello|hey|yo|sup|good morning|good afternoon|good evening|howdy)(?:\s+eva)?\b[!?.]*$/i.test(cleaned);
    const isSocialOrIdentity =
      /^(?:who are you|what are you|what can you do|what is eva|introduce yourself|tell me about yourself|who made you|who created you|who built you|who developed you|who made eva|who created eva)\b[!?.]*$/i.test(cleaned) ||
      /^(?:how are you|how are you doing|hows it going|how are things)\b[!?.]*$/i.test(cleaned) ||
      /^(?:thank you|thanks|thx|thank you eva|thanks eva)\b[!?.]*$/i.test(cleaned) ||
      /^(?:bye|goodbye|see you|cya)\b[!?.]*$/i.test(cleaned) ||
      /^(?:help|help me|can you help me)\b[!?.]*$/i.test(cleaned);

    const isProjectListQuery = /^(?:what projects (?:do i have|are on my desktop)|list (?:my )?projects|show (?:my )?projects|what(?:'s| is) on (?:my )?desktop)\b[!?.]*$/i.test(cleaned);

    if (isGreeting || isSocialOrIdentity || isProjectListQuery) {
      refinements.push('Identified conversational dialogue query');
      return {
        originalText: original,
        enhancedPrompt: cleaned,
        intentCategory: 'GENERAL',
        entities: {
          taskDescription: isGreeting ? 'greeting' : isProjectListQuery ? 'list_projects' : 'social_dialogue',
        },
        refinements,
      };
    }

    // 0b. Intent: Dialogue / Memory Queries (e.g. "What was the response of Claude code after reviewing the project", "What did Claude code say")
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
      refinements.push('Identified inquiry regarding previous Claude Code / tool execution output');
      return {
        originalText: original,
        enhancedPrompt: cleaned.endsWith('?') ? cleaned : `${cleaned}?`,
        intentCategory: 'GENERAL',
        entities: {
          taskDescription: 'query_last_response',
        },
        refinements,
      };
    }

    // 1b. Intent: Real-time Mac Health, Battery, Heating & Open Apps
    if (
      lower.includes('mac status') ||
      lower.includes('system status') ||
      lower.includes('battery') ||
      lower.includes('charging') ||
      lower.includes('heating') ||
      lower.includes('temperature') ||
      lower.includes('opened apps') ||
      lower.includes('running apps') ||
      lower.includes('how is my mac') ||
      lower.includes('hows my mac') ||
      lower.includes('what apps are open') ||
      lower.includes('what apps are running')
    ) {
      refinements.push('Identified real-time macOS system health & diagnostics query');
      return {
        originalText: original,
        enhancedPrompt: 'Check macOS system health, battery, charging, thermals, and opened applications.',
        intentCategory: 'SYSTEM',
        entities,
        refinements,
      };
    }

    // 2. Intent: Video Call ("videocalling anyone on whatsapp", "video call shivam", "facetime mom")
    if (lower.includes('video call') || lower.includes('videocall') || lower.includes('facetime')) {
      let recipient = 'contact';
      const match = cleaned.match(/(?:video\s*call(?:ing)?|videocall(?:ing)?|facetime)\s+(?:with\s+|to\s+)?(.+?)(?:\s+(?:on|in|via)\s+whatsapp)?[.?]?$/i);
      if (match && match[1]) {
        recipient = match[1].replace(/\s+(?:on|in|via)\s+whatsapp$/i, '').trim();
      }
      const formattedRecipient = recipient.charAt(0).toUpperCase() + recipient.slice(1);
      entities.recipient = formattedRecipient;
      entities.callType = 'video';
      refinements.push(`Extracted video call target: ${formattedRecipient}`);

      return {
        originalText: original,
        enhancedPrompt: `Start a WhatsApp video call with ${formattedRecipient}.`,
        intentCategory: 'CALL',
        entities,
        refinements,
      };
    }

    // 3. Intent: Voice Call ("calling anyone on whatsapp", "call shivam", "voice call")
    if ((lower.includes('call') || lower.includes('phone')) && !lower.includes('claude') && !lower.includes('recall')) {
      let recipient = 'contact';
      const match = cleaned.match(/(?:call(?:ing)?|phone|voice\s*call(?:ing)?)\s+(?:with\s+|to\s+)?(.+?)(?:\s+(?:on|in|via)\s+whatsapp)?[.?]?$/i);
      if (match && match[1]) {
        recipient = match[1].replace(/\s+(?:on|in|via)\s+whatsapp$/i, '').trim();
      }
      const formattedRecipient = recipient.charAt(0).toUpperCase() + recipient.slice(1);
      entities.recipient = formattedRecipient;
      entities.callType = 'voice';
      refinements.push(`Extracted voice call target: ${formattedRecipient}`);

      return {
        originalText: original,
        enhancedPrompt: `Start a WhatsApp voice call with ${formattedRecipient}.`,
        intentCategory: 'CALL',
        entities,
        refinements,
      };
    }

    // 4. Intent: WhatsApp Message ("send message to priya saying hello")
    const msgMatch = cleaned.match(/(?:send(?:ing|ong)?|message|messaging|text|texting|tell)\s+(?:a\s+message\s+to\s+|to\s+)?([a-zA-Z0-9 ._-]+?)\s+(?:saying\s+|that\s+|['"])(.+?)['"]?(?:\s+(?:in|on|via)\s+whatsapp)?$/i)
      || cleaned.match(/(?:send(?:ing|ong)?|message|messaging|text|texting)\s+['"]?(.+?)['"]?\s+to\s+([a-zA-Z0-9 ._-]+?)(?:\s+(?:in|on|via)\s+whatsapp)?$/i);

    if (msgMatch) {
      let recipient = '';
      let message = '';

      if (cleaned.toLowerCase().includes('saying') || cleaned.toLowerCase().includes('tell')) {
        recipient = msgMatch[1].trim();
        message = msgMatch[2].trim();
      } else {
        message = msgMatch[1].trim();
        recipient = msgMatch[2].trim();
      }

      recipient = recipient.replace(/\s+(?:in|on|via)\s+whatsapp$/i, '').trim();
      const formattedRecipient = recipient.charAt(0).toUpperCase() + recipient.slice(1);
      entities.recipient = formattedRecipient;
      entities.message = message;
      refinements.push(`Structured message payload "${message}" for recipient "${formattedRecipient}"`);

      return {
        originalText: original,
        enhancedPrompt: `Send WhatsApp message "${message}" to ${formattedRecipient}.`,
        intentCategory: 'MESSAGE',
        entities,
        refinements,
      };
    }

    // 5. Intent: General "open <target> in <app>" or Web & URL Navigation
    const inAppMatch = cleaned.match(/^(?:open|launch|start)\s+(.+?)\s+(?:in|with|using)\s+([a-zA-Z0-9 ._-]+?)[.?]?$/i);
    if (inAppMatch && !lower.includes('claude') && !lower.includes('and review') && !lower.includes('and complete')) {
      const target = inAppMatch[1].trim();
      const appRaw = inAppMatch[2].trim();
      const appLower = appRaw.toLowerCase();

      // Case A: Application is a Web Browser
      if (/^(?:google\s+)?chrome|safari|firefox|brave|edge|arc|browser$/i.test(appLower)) {
        const browserTarget = appLower.includes('safari') ? 'Safari' : 'Google Chrome';
        let url = '';
        if (WEB_DOMAIN_REGEX.test(target) || /^https?:\/\//i.test(target)) {
          url = target.startsWith('http://') || target.startsWith('https://') ? target : `https://${target}`;
        } else if (target.includes('.') && !target.includes(' ')) {
          url = `https://${target}`;
        } else {
          url = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
        }

        entities.url = url;
        entities.appName = browserTarget;
        entities.taskDescription = target;
        refinements.push(`Extracted web destination: "${target}" in ${browserTarget}`);

        return {
          originalText: original,
          enhancedPrompt: `Open ${url} in ${browserTarget}.`,
          intentCategory: 'BROWSER',
          entities,
          refinements,
        };
      }

      // Case B: Application is Visual Studio Code
      if (/^(?:vs\s*code|vscode|code|visual\s+studio\s+code)$/i.test(appLower)) {
        const cleanTarget = target.replace(/^(?:project|folder|directory|dir)\s+/i, '').trim();
        entities.filePath = cleanTarget;
        entities.appName = 'Visual Studio Code';
        refinements.push(`Targeted project or file "${cleanTarget}" for Visual Studio Code`);
        return {
          originalText: original,
          enhancedPrompt: `Open project ${cleanTarget} in Visual Studio Code.`,
          intentCategory: 'DEVELOPER',
          entities,
          refinements,
        };
      }
    }

    const hasWebDomain = WEB_DOMAIN_REGEX.test(cleaned);
    const isSearchQuery = lower.startsWith('search for ') || lower.startsWith('search ') || lower.startsWith('google ') || lower.startsWith('look up ');

    if (hasWebDomain || isSearchQuery || lower.includes('in chrome') || lower.includes('in safari') || lower.includes('in browser')) {
      let browserTarget = '';
      if (lower.includes('in chrome') || lower.includes('using chrome') || lower.includes('with chrome')) {
        browserTarget = 'Google Chrome';
      } else if (lower.includes('in safari') || lower.includes('using safari')) {
        browserTarget = 'Safari';
      }

      const domainMatch = cleaned.match(WEB_DOMAIN_REGEX);
      if (domainMatch) {
        let url = domainMatch[0];
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = `https://${url}`;
        }
        entities.url = url;
        if (browserTarget) entities.appName = browserTarget;
        refinements.push(`Extracted web URL: ${url}${browserTarget ? ` (Browser: ${browserTarget})` : ''}`);

        const browserSuffix = browserTarget ? ` in ${browserTarget}` : '';
        return {
          originalText: original,
          enhancedPrompt: `Open ${url}${browserSuffix}.`,
          intentCategory: 'BROWSER',
          entities,
          refinements,
        };
      }

      if (isSearchQuery) {
        let query = cleaned.replace(/^(?:search\s+for|search|google|look\s+up)\s+/i, '');
        query = query.replace(/\s+(?:on|in)\s+google$/i, '').replace(/\s+in\s+(?:chrome|safari|browser)$/i, '').replace(/[.?]+$/, '').trim();
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        entities.url = searchUrl;
        entities.taskDescription = query;
        if (browserTarget) entities.appName = browserTarget;
        refinements.push(`Constructed Google search for: "${query}"`);

        return {
          originalText: original,
          enhancedPrompt: `Search the web for "${query}"${browserTarget ? ` in ${browserTarget}` : ''}.`,
          intentCategory: 'BROWSER',
          entities,
          refinements,
        };
      }
    }

    // 6. Intent: YouTube & Music / Video Playback ("play bohemian rhapsody on youtube", "playing tu mileya on youtube", "open youtube and search tu mileya")
    if (
      lower.includes('youtube') ||
      lower.includes('play a song') ||
      lower.includes('playing a song') ||
      lower.includes('play music') ||
      lower.includes('playing music') ||
      ((lower.startsWith('play ') || lower.startsWith('playing ')) && !lower.includes('project'))
    ) {
      let query = 'trending music';
      const isGeneric = /^(?:open\s+youtube(?:\s+and\s+play)?|play|playing)(?:\s+(?:a\s+)?song|\s+music|\s+something)?(?:\s+(?:on|in)\s+youtube)?\b[!?.]*$/i.test(cleaned);
      if (!isGeneric) {
        const songMatch = cleaned.match(/(?:(?:open\s+youtube\s+and\s+)?(?:play|playing|search\s+for|search|find)(?:\s+a)?(?:\s+song)?(?:\s+music)?)\s+(?:called\s+|named\s+)?['"]?(.+?)['"]?(?:\s+(?:on|in)\s+youtube)?(?:[.?]|$)/i)
          || cleaned.match(/(?:search\s+for|search|find|play|playing)\s+['"]?(.+?)['"]?\s+(?:on|in)\s+youtube[.?]?$/i);
        if (songMatch && songMatch[1]) {
          const candidate = songMatch[1].replace(/\s+(?:on|in)\s+youtube$/i, '').trim();
          if (candidate && !['a song', 'song', 'music', 'trending music', 'a video', 'video'].includes(candidate.toLowerCase())) {
            query = candidate;
          }
        }
      }
      refinements.push(`Extracted YouTube media query: "${query}"`);
      entities.taskDescription = query;

      return {
        originalText: original,
        enhancedPrompt: `Open YouTube and play "${query}".`,
        intentCategory: 'BROWSER',
        entities,
        refinements,
      };
    }

    // 7a. Intent: Full Compound VS Code + Claude Review + Claude Task
    if (!isQuestion && mentionsVSCode(lower) && lower.includes('claude') && lower.includes('review') && (lower.includes('task') || lower.includes('completing') || lower.includes('complete') || lower.includes('competing'))) {
      const projMatch = cleaned.match(/(?:open|launch)\s+(?:project\s+)?([a-zA-Z0-9_-]+)(?:\s+(?:present\s+)?on\s+desktop)?\s+in\s+(?:vs\s*code|code|visual\s+studio\s+code)/i)
        || cleaned.match(/(?:open|launch)\s+([a-zA-Z0-9_-]+)\s+in\s+(?:vs\s*code|code|visual\s+studio\s+code)/i);
      let projectName = '';
      if (projMatch && projMatch[1]) {
        const candidate = projMatch[1].trim();
        if (!['project', 'desktop', 'the', 'a', 'this', 'current'].includes(candidate.toLowerCase())) {
          projectName = candidate;
        }
      }

      let taskPrompt = '';
      const taskMatch = cleaned.match(/(?:call claude to|ask claude to|complete task|completing a task|fix|build)\s+['"]?(.+?)['"]?(?:\s+(?:with|in)\s+claude)?$/i);
      if (taskMatch && taskMatch[1] && taskMatch[1].trim() !== 'with claude') {
        taskPrompt = taskMatch[1].trim();
      }

      if (projectName) entities.filePath = projectName;
      if (taskPrompt) entities.taskDescription = taskPrompt;
      refinements.push(`Identified compound developer pipeline: VS Code launch${projectName ? ` (${projectName})` : ''} + Claude Code review + Claude task execution`);
      return {
        originalText: original,
        enhancedPrompt: projectName
          ? `Open project ${projectName} in Visual Studio Code, perform an automated codebase review with Claude Code, and use Claude Code to execute ${taskPrompt ? `task: "${taskPrompt}"` : 'the task.'}`
          : `Open project in Visual Studio Code, perform an automated codebase review with Claude Code, and use Claude Code to execute ${taskPrompt ? `task: "${taskPrompt}"` : 'the task.'}`,
        intentCategory: 'DEVELOPER',
        entities,
        refinements,
      };
    }

    // 7b. Intent: Compound VS Code + Claude Review
    if (!isQuestion && mentionsVSCode(lower) && lower.includes('claude') && lower.includes('review')) {
      const projMatch = cleaned.match(/(?:open|launch)\s+(?:project\s+)?([a-zA-Z0-9_-]+)(?:\s+(?:present\s+)?on\s+desktop)?\s+in\s+(?:vs\s*code|code|visual\s+studio\s+code)/i)
        || cleaned.match(/(?:open|launch)\s+([a-zA-Z0-9_-]+)\s+in\s+(?:vs\s*code|code|visual\s+studio\s+code)/i);
      let projectName = '';
      if (projMatch && projMatch[1]) {
        const candidate = projMatch[1].trim();
        if (!['project', 'desktop', 'the', 'a', 'this', 'current'].includes(candidate.toLowerCase())) {
          projectName = candidate;
        }
      }
      if (projectName) entities.filePath = projectName;
      refinements.push(`Identified compound developer workflow: Open ${projectName || 'project'} in VS Code and review with Claude Code`);
      return {
        originalText: original,
        enhancedPrompt: projectName
          ? `Open project ${projectName} in Visual Studio Code and review with Claude Code.`
          : 'Open project in Visual Studio Code and review with Claude Code.',
        intentCategory: 'DEVELOPER',
        entities,
        refinements,
      };
    }

    // 7c. Intent: Compound VS Code + Claude Task
    if (!isQuestion && mentionsVSCode(lower) && lower.includes('claude') && (lower.includes('task') || lower.includes('fix') || lower.includes('call claude') || lower.includes('ask claude'))) {
      const projMatch = cleaned.match(/(?:open|launch)\s+(?:project\s+)?([a-zA-Z0-9_-]+)(?:\s+(?:present\s+)?on\s+desktop)?\s+in\s+(?:vs\s*code|code|visual\s+studio\s+code)/i)
        || cleaned.match(/(?:open|launch)\s+([a-zA-Z0-9_-]+)\s+in\s+(?:vs\s*code|code|visual\s+studio\s+code)/i);
      let projectName = '';
      if (projMatch && projMatch[1]) {
        const candidate = projMatch[1].trim();
        if (!['project', 'desktop', 'the', 'a', 'this', 'current'].includes(candidate.toLowerCase())) {
          projectName = candidate;
        }
      }
      if (projectName) entities.filePath = projectName;
      refinements.push(`Identified compound developer workflow: Open ${projectName || 'project'} in VS Code and complete task with Claude Code`);
      return {
        originalText: original,
        enhancedPrompt: projectName
          ? `Open project ${projectName} in Visual Studio Code and complete task with Claude Code.`
          : 'Open project in Visual Studio Code and complete task with Claude Code.',
        intentCategory: 'DEVELOPER',
        entities,
        refinements,
      };
    }

    // 7d. Intent: Open Desktop Project in VS Code (any project)
    if (!isQuestion && (lower.includes('open') || lower.includes('launch')) && mentionsVSCode(lower)) {
      const projMatch = cleaned.match(/(?:open|launch)\s+(?:project\s+)?([a-zA-Z0-9_-]+)(?:\s+(?:present\s+)?on\s+desktop)?\s+in\s+(?:vs\s*code|code|visual\s+studio\s+code)/i)
        || cleaned.match(/(?:open|launch)\s+([a-zA-Z0-9_-]+)\s+in\s+(?:vs\s*code|code|visual\s+studio\s+code)/i)
        || cleaned.match(/(?:open|launch)\s+(?:vs\s*code|code|visual\s+studio\s+code)\s+(?:on|in|for)\s+([a-zA-Z0-9_-]+)/i);
      let projectName = '';
      if (projMatch && projMatch[1]) {
        const candidate = projMatch[1].trim();
        if (!['project', 'desktop', 'the', 'a', 'this'].includes(candidate.toLowerCase())) {
          projectName = candidate;
        }
      }
      refinements.push(`Targeted Desktop project: "${projectName || 'current workspace'}" for VS Code`);
      entities.filePath = projectName;
      return {
        originalText: original,
        enhancedPrompt: projectName ? `Open project ${projectName} in Visual Studio Code.` : 'Open project in Visual Studio Code.',
        intentCategory: 'DEVELOPER',
        entities,
        refinements,
      };
    }

    // 7e. Intent: Claude Code Review ONLY
    if (!isQuestion && lower.includes('review') && lower.includes('claude')) {
      refinements.push('Identified Claude Code automated review request');
      return {
        originalText: original,
        enhancedPrompt: 'Perform an automated architectural code review with Claude Code.',
        intentCategory: 'DEVELOPER',
        entities,
        refinements,
      };
    }

    // 7f. Intent: Claude Code Task ONLY
    if (!isQuestion && (lower.includes('complete') || lower.includes('task') || lower.includes('fix') || lower.includes('call claude') || lower.includes('ask claude')) && lower.includes('claude')) {
      let taskPrompt = cleaned.replace(/\s+with\s+claude$/i, '').trim();
      refinements.push(`Identified Claude Code task directive: "${taskPrompt}"`);
      entities.taskDescription = taskPrompt;
      return {
        originalText: original,
        enhancedPrompt: `Instruct Claude Code to execute task: "${taskPrompt}".`,
        intentCategory: 'DEVELOPER',
        entities,
        refinements,
      };
    }

    // 8. Intent: App Launch or Inspection (ONLY if not a URL / domain, and not an "in <app>" phrase)
    if (lower.startsWith('open ') || lower.startsWith('launch ') || lower.startsWith('start ')) {
      let rawApp = cleaned.replace(/^(?:open|launch|start)\s+/i, '').replace(/[.?]+$/, '').trim();
      rawApp = rawApp.replace(/\s+(?:over\s+here|right\s+here|over\s+there|right\s+there|up\s+here|for\s+me|real\s+quick|right\s+now|now)$/i, '').trim();
      const hasInApp = /\s+(?:in|with|using|on)\s+[a-zA-Z0-9 ._-]+$/i.test(rawApp);
      if (!hasInApp && !WEB_DOMAIN_REGEX.test(rawApp)) {
        const formattedApp = normalizeMacAppName(rawApp);
        entities.appName = formattedApp;
        refinements.push(`Targeted application: ${formattedApp}`);
        return {
          originalText: original,
          enhancedPrompt: `Launch ${formattedApp}.`,
          intentCategory: 'APP_CONTROL',
          entities,
          refinements,
        };
      }
    }

    // 8b. Intent: App Close or Window Close ("close terminal", "quit chrome", "close calculator", "close window")
    if (lower.startsWith('close ') || lower.startsWith('quit ') || lower.startsWith('exit ')) {
      const rawTarget = cleaned.replace(/^(?:close|quit|exit)\s+(?:the\s+)?(?:window\s+of\s+|window\s+|app\s+)?/i, '').replace(/[.?]+$/, '').trim();
      const targetApp = rawTarget ? normalizeMacAppName(rawTarget) : 'current application';
      entities.appName = targetApp;
      refinements.push(`Targeted application to close: ${targetApp}`);
      return {
        originalText: original,
        enhancedPrompt: `Close window of ${targetApp}.`,
        intentCategory: 'APP_CONTROL',
        entities,
        refinements,
      };
    }

    if (lower.includes('running') || lower.includes('status') || lower.includes('check if') || lower.includes('inspect')) {
      let statusMatch = cleaned.match(/^(?:is|check if|status of|inspect)\s+(.+?)\s+(?:is\s+)?(?:currently\s+)?(?:running|open|active|status)[.?]?$/i);
      if (!statusMatch) {
        statusMatch = cleaned.match(/^(?:is|check if|status of|inspect)\s+(.+?)[.?]?$/i);
      }
      if (statusMatch) {
        const rawApp = statusMatch[1].trim().replace(/[.?]+$/, '');
        const formattedApp = normalizeMacAppName(rawApp);
        entities.appName = formattedApp;
        refinements.push(`Targeted application: ${formattedApp}`);
        return {
          originalText: original,
          enhancedPrompt: `Check if ${formattedApp} is running.`,
          intentCategory: 'APP_CONTROL',
          entities,
          refinements,
        };
      }
    }

    // Default: Cleaned and punctuated prompt
    const enhanced = cleaned.charAt(0).toUpperCase() + cleaned.slice(1) + (cleaned.endsWith('.') || cleaned.endsWith('?') ? '' : '.');
    return {
      originalText: original,
      enhancedPrompt: enhanced,
      intentCategory: 'GENERAL',
      entities,
      refinements,
    };
  }
}
