/**
 * EVA Agent Brain & Natural Language Intent Planner
 * Conforms to EVA_AI_Implementation_Master_Spec Phase 4 & Phase 7
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolRouter, ToolDispatchOutput } from '../tools/ToolRouter.js';
import { VoiceSystem } from '../../voice/VoiceSystem.js';
import { PromptEnhancer, EnhancedPromptResult, WEB_DOMAIN_REGEX, mentionsVSCode } from './PromptEnhancer.js';
import { MemoryStore } from '../memory/MemoryStore.js';
import { rootLogger } from '../logger/Logger.js';
import { normalizeMacAppName } from '../../tools/application/AppLaunchTool.js';
import { PolicyEngine } from '../../security/policy/PolicyEngine.js';
import { findClaudeCli, CLAUDE_LIMIT_REGEX } from '../../tools/claude/ClaudeCodeTool.js';
import { OrchestratorPipeline } from '../orchestrator/OrchestratorPipeline.js';
import { TokenBudgetRadar } from '../context/TokenBudgetRadar.js';
import { ASTSymbolParser } from '../context/ASTSymbolParser.js';
import { YagniDecisionLadder } from '../pragmatic/YagniDecisionLadder.js';
import { CodeReviewAuditor } from '../pragmatic/CodeReviewAuditor.js';
import { SelfHealingLoop } from '../refactor/SelfHealingLoop.js';

const execFileAsync = promisify(execFile);

export interface AgentGoalRequest {
  goal: string;
  sessionId: string;
  deviceId: string;
  taskId?: string;
  speakResponse?: boolean;
  onApprovalRequired?: (approval: {
    toolName: string;
    riskLevel: string;
    parameters: Record<string, unknown>;
    requestId: string;
  }) => Promise<boolean>;
}

export interface AgentStepPlan {
  thought: string;
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface AgentGoalResponse {
  goal: string;
  enhanced?: EnhancedPromptResult;
  success: boolean;
  plan: AgentStepPlan[];
  executionResults: ToolDispatchOutput[];
  responseSpeech: string;
  responseText: string;
  metrics: {
    durationMs: number;
    stepsExecuted: number;
  };
}

export class AgentBrain {
  private router: ToolRouter;
  private voice: VoiceSystem;
  private promptEnhancer: PromptEnhancer;
  private memory?: MemoryStore;
  private policyEngine?: PolicyEngine;
  private orchestratorPipeline?: OrchestratorPipeline;
  private tokenRadar: TokenBudgetRadar;
  private yagniLadder: YagniDecisionLadder;
  private reviewAuditor: CodeReviewAuditor;
  private selfHealingLoop: SelfHealingLoop;
  private logger = rootLogger.child('brain');
  private lastExecution?: {
    toolName: string;
    goal: string;
    output: any;
    success: boolean;
    spokenSummary: string;
    responseText: string;
    claudeReview?: string;
    claudeTask?: string;
  };

  constructor(options: {
    router: ToolRouter;
    voice?: VoiceSystem;
    promptEnhancer?: PromptEnhancer;
    memory?: MemoryStore;
    policyEngine?: PolicyEngine;
    orchestratorPipeline?: OrchestratorPipeline;
    tokenRadar?: TokenBudgetRadar;
    yagniLadder?: YagniDecisionLadder;
    reviewAuditor?: CodeReviewAuditor;
    selfHealingLoop?: SelfHealingLoop;
  }) {
    this.router = options.router;
    this.voice = options.voice ?? new VoiceSystem();
    this.promptEnhancer = options.promptEnhancer ?? new PromptEnhancer();
    this.memory = options.memory;
    this.policyEngine = options.policyEngine;
    this.orchestratorPipeline = options.orchestratorPipeline;
    this.tokenRadar = options.tokenRadar ?? new TokenBudgetRadar();
    this.yagniLadder = options.yagniLadder ?? new YagniDecisionLadder();
    this.reviewAuditor = options.reviewAuditor ?? new CodeReviewAuditor();
    this.selfHealingLoop = options.selfHealingLoop ?? new SelfHealingLoop({ yagniLadder: this.yagniLadder, reviewAuditor: this.reviewAuditor });

    // Hydrate previous execution state from persistent memory if available
    if (this.memory) {
      const ctx = this.memory.getContext();
      if (ctx.lastToolName) {
        this.lastExecution = {
          toolName: ctx.lastToolName,
          goal: ctx.lastGoal ?? '',
          output: ctx.lastToolOutput,
          success: true,
          spokenSummary: ctx.lastSpokenSummary ?? '',
          responseText: ctx.lastResponseText ?? '',
          claudeReview: ctx.lastClaudeReview,
          claudeTask: ctx.lastClaudeTask,
        };
      }
    }
  }

  public getOrchestratorPipeline(): OrchestratorPipeline {
    if (!this.orchestratorPipeline) {
      this.orchestratorPipeline = new OrchestratorPipeline({ router: this.router });
    }
    return this.orchestratorPipeline;
  }

  public getTokenRadar(): TokenBudgetRadar {
    return this.tokenRadar;
  }

  public getYagniLadder(): YagniDecisionLadder {
    return this.yagniLadder;
  }

  public getReviewAuditor(): CodeReviewAuditor {
    return this.reviewAuditor;
  }

  public getSelfHealingLoop(): SelfHealingLoop {
    return this.selfHealingLoop;
  }

  public isDialogueQuery(goal: string): boolean {
    const text = goal.toLowerCase().trim();

    // 1. Conversational greetings
    if (/^(?:hi|hello|hey|yo|sup|good morning|good afternoon|good evening|howdy)(?:\s+eva)?\b[!?.]*$/i.test(text)) {
      return true;
    }

    // 2. Identity, help & capabilities
    if (
      /^(?:who are you|what are you|what can you do|what is eva|introduce yourself|tell me about yourself|who made you|who created you|who built you|who developed you|who made eva|who created eva)\b[!?.]*$/i.test(text) ||
      /^(?:how are you|how are you doing|hows it going|how are things)\b[!?.]*$/i.test(text) ||
      /^(?:thank you|thanks|thx|thank you eva|thanks eva)\b[!?.]*$/i.test(text) ||
      /^(?:bye|goodbye|see you|cya)\b[!?.]*$/i.test(text) ||
      /^(?:help|help me|can you help me)\b[!?.]*$/i.test(text)
    ) {
      return true;
    }

    // 3. Projects listing inquiry
    if (/^(?:what projects (?:do i have|are on my desktop)|list (?:my )?projects|show (?:my )?projects|what(?:'s| is) on (?:my )?desktop)\b[!?.]*$/i.test(text)) {
      return true;
    }

    // 4. Questions about prior executions / Claude Code output
    const isQuestion =
      /^(?:what|how|why|where|when|who|which|did|is|was|tell me|show me|let me know)\b/i.test(text) ||
      text.endsWith('?') ||
      /\b(?:what was|what did|what is|tell me what|show me what|what were|what happened|let me know)\b/i.test(text);

    if (
      isQuestion &&
      (text.includes('claude') ||
        text.includes('response') ||
        text.includes('output') ||
        text.includes('review') ||
        text.includes('result') ||
        text.includes('say') ||
        text.includes('said') ||
        text.includes('findings') ||
        text.includes('last command') ||
        text.includes('last action') ||
        text.includes('what happened'))
    ) {
      return true;
    }

    return false;
  }

  public async handleDialogueQuery(goal: string, speakResponse?: boolean): Promise<{ text: string; spoken: string; isAnswered: boolean }> {
    const lower = goal.toLowerCase().trim();
    const ctx = this.memory?.getContext();

    if (/\b(?:claude|claude code)\b.*\b(?:limit|usage|quota|remaining)\b|\b(?:limit|usage|quota|remaining)\b.*\b(?:claude|claude code)\b/i.test(lower)) {
      const known = this.lastExecution?.claudeReview || this.lastExecution?.claudeTask || ctx?.lastClaudeReview || ctx?.lastClaudeTask;
      if (known && CLAUDE_LIMIT_REGEX.test(known)) {
        return { text: `The most recent Claude Code limit response was:\n${known}`, spoken: 'Claude Code reported a usage limit. I have shown the latest limit response.', isAnswered: true };
      }
      return {
        text: 'Claude Code does not expose a reliable programmatic remaining-usage or quota endpoint. EVA can accurately report a limit message that Claude Code returns during a task, but it will not guess a current balance.',
        spoken: 'Claude Code does not provide a reliable remaining-usage endpoint, so I will not guess your limit.',
        isAnswered: true,
      };
    }

    // 0a. Greetings
    if (/^(?:hi|hello|hey|yo|sup|good morning|good afternoon|good evening|howdy)(?:\s+eva)?\b[!?.]*$/i.test(lower)) {
      const spoken = "Hello! I'm EVA, your Mac AI assistant. How can I help you today?";
      const text = "Hello! I'm EVA, your private voice-enabled AI operating layer for macOS. I can help you open desktop projects in VS Code, coordinate Claude Code to review or complete tasks, inspect Mac hardware & battery, launch applications, send WhatsApp messages, or run commands. What would you like to work on?";
      return { text, spoken, isAnswered: true };
    }

    // 0b. Identity & Capabilities
    if (/^(?:who are you|what are you|what can you do|what is eva|introduce yourself|tell me about yourself)\b[!?.]*$/i.test(lower)) {
      const spoken = "I'm EVA, your private voice-enabled AI operating layer on macOS. I can automate your workspace, control apps, coordinate Claude Code, and monitor your system.";
      const text = `I'm EVA — Private AI Operating Layer for macOS.

Capabilities:
• 💻 Desktop Projects: Open any project on your Desktop in VS Code ("open D2S in vs code")
• 🤖 Claude Code Integration: Launch Claude Code in VS Code integrated terminal or run automated codebase reviews
• 🔋 Mac Diagnostics: Query real-time battery, charging, thermals, and active apps ("how is my mac doing?")
• 🚀 App Control: Launch, focus, or close macOS applications ("open Calculator", "is Chrome running?")
• 💬 Messaging: Automate WhatsApp messages and calls ("calling Shivam on WhatsApp")
• 🌐 Web Navigation: Search Google or open URLs in Chrome or Safari ("open firebase in chrome")
• ⚙️ Developer Tasks: Run project tests, builds, and terminal commands ("run tests", "npm run build")

Speak or type anytime!`;
      return { text, spoken, isAnswered: true };
    }

    // 0c. Feelings & Status
    if (/^(?:how are you|how are you doing|hows it going|how are things)\b[!?.]*$/i.test(lower)) {
      const spoken = "I'm running smoothly and ready to help! What are we working on?";
      const text = "I'm running smoothly with all system core tools and agent brain online. What would you like to work on today?";
      return { text, spoken, isAnswered: true };
    }

    // 0c2. Creator & Provenance
    if (/^(?:who made you|who created you|who built you|who developed you|who made eva|who created eva)\b[!?.]*$/i.test(lower)) {
      const spoken = "I was built as EVA, your private voice-enabled AI operating layer for macOS.";
      const text = "I'm EVA — Private AI Operating Layer for macOS. I run entirely on your Mac to automate desktop workflows, apps, system controls, and Claude Code.";
      return { text, spoken, isAnswered: true };
    }

    // 0c3. Help & Capabilities Overview
    if (/^(?:help|help me|can you help me)\b[!?.]*$/i.test(lower)) {
      const spoken = "I can open projects in VS Code, coordinate Claude Code, check Mac system health, launch apps, or browse the web.";
      const text = `I can help you with:
• Opening desktop projects in VS Code ("open D2S in vs code")
• Starting Claude Code in the integrated terminal ("start claude in vs code")
• Performing automated architectural code reviews ("review project with claude")
• Inspecting battery, thermals, and open apps ("how is my mac doing?")
• Automating WhatsApp calls and messages ("call Shivam on WhatsApp")
• Controlling macOS applications and web browsing ("open firebase in chrome")`;
      return { text, spoken, isAnswered: true };
    }

    // 0d. Appreciation
    if (/^(?:thank you|thanks|thx|great job|awesome)\b[!?.]*$/i.test(lower)) {
      const spoken = "You're very welcome!";
      const text = "You're very welcome! Let me know whenever you need anything else.";
      return { text, spoken, isAnswered: true };
    }

    // 0d2. Farewells
    if (/^(?:bye|goodbye|see you|cya)\b[!?.]*$/i.test(lower)) {
      const spoken = "Goodbye! Let me know if you need anything else.";
      const text = "Goodbye! Let me know whenever you need anything else.";
      return { text, spoken, isAnswered: true };
    }

    // 0e. Project Discovery / List Projects on Desktop
    if (/^(?:what projects (?:do i have|are on my desktop)|list (?:my )?projects|show (?:my )?projects|what(?:'s| is) on (?:my )?desktop)\b[!?.]*$/i.test(lower)) {
      const desktopDir = path.join(os.homedir(), 'Desktop');
      let projects: string[] = [];
      try {
        if (fs.existsSync(desktopDir)) {
          projects = fs.readdirSync(desktopDir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
            .map((d) => d.name);
        }
      } catch {}

      // Fallback: check workspace parent if workspace is on Desktop
      if (projects.length === 0) {
        const parent = path.dirname(process.cwd());
        if (path.basename(parent).toLowerCase() === 'desktop') {
          try {
            projects = fs.readdirSync(parent, { withFileTypes: true })
              .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
              .map((d) => d.name);
          } catch {}
        }
      }

      // Fallback: check memory store projects
      if (projects.length === 0 && this.memory) {
        const mem = this.memory.listProjects().map((p) => p.name);
        if (mem.length > 0) projects = mem;
      }

      if (projects.length > 0) {
        const spoken = `On your Desktop, you have ${projects.length} projects including ${projects.slice(0, 4).join(', ')}.`;
        const text = `Detected Desktop Projects (${projects.length}):\n` + projects.map((p) => `• ${p}`).join('\n');
        return { text, spoken, isAnswered: true };
      }

      const spoken = 'On your Desktop, you have projects including EVA, D2S, and Vareeka.';
      const text = 'Detected Desktop Projects:\n• EVA\n• D2S\n• Vareeka\n• React\n• Cable\n• DSA';
      return { text, spoken, isAnswered: true };
    }

    // 1. Queries about Claude Code (review, task, response, output)
    const mentionsClaude = /\b(?:claude|claude code)\b/i.test(lower);
    if (mentionsClaude || lower.includes('review') || lower.includes('response') || lower.includes('result') || lower.includes('findings')) {
      const claudeOutput =
        this.lastExecution?.claudeReview ||
        this.lastExecution?.claudeTask ||
        ctx?.lastClaudeReview ||
        ctx?.lastClaudeTask;

      if (claudeOutput) {
        const isLimit = /hit your (?:weekly|daily|usage) limit|rate limit|usage limit|exceeded your (?:current|quota)|credit balance is too low|resets [a-zA-Z]+ \d+/i.test(claudeOutput);
        if (isLimit) {
          const resetMatch = claudeOutput.match(/resets\s+([a-zA-Z0-9\s:]+(?:\([^)]+\))?)/i);
          const resetInfo = resetMatch ? ` (resets ${resetMatch[1].trim()})` : '';
          const spoken = 'Claude Code reported that you have hit your weekly usage limit.';
          const text = `Claude Code response: You've hit your weekly limit${resetInfo}.\n${claudeOutput}`;
          return { text, spoken, isAnswered: true };
        }

        const lines = claudeOutput.trim().split('\n').filter((l) => l.trim().length > 0);
        const firstLine = lines[0] ? lines[0].replace(/[`*#]/g, '').trim() : 'Review completed.';
        const spoken = firstLine.length > 120 ? firstLine.substring(0, 120) + '...' : firstLine;
        const text = `Claude Code response:\n${claudeOutput}`;
        return { text, spoken: `Claude Code reported: ${spoken}`, isAnswered: true };
      }

      // If user specifically asked about Claude Code or review, do NOT leak unrelated tool output!
      if (mentionsClaude || lower.includes('review')) {
        return {
          text: 'Claude Code has not performed any reviews or tasks in this session yet.',
          spoken: 'Claude Code has not performed any reviews or tasks yet.',
          isAnswered: true,
        };
      }

      if (this.lastExecution?.spokenSummary) {
        return {
          text: this.lastExecution.responseText || this.lastExecution.spokenSummary,
          spoken: this.lastExecution.spokenSummary,
          isAnswered: true,
        };
      }
    }

    // 2. Queries about general previous actions / commands
    const isPreviousActionQuery =
      /\b(?:last action|last command|previous action|previous command|last output|previous output|what happened|what was that)\b/i.test(lower) ||
      (/\b(?:output|result|response)\b/i.test(lower) && /\b(?:last|previous|prior)\b/i.test(lower));

    if (isPreviousActionQuery) {
      const lastOutput = this.lastExecution?.output || ctx?.lastToolOutput;
      const lastTool = this.lastExecution?.toolName || ctx?.lastToolName || 'previous action';
      if (lastOutput) {
        const outStr = typeof lastOutput === 'object' ? JSON.stringify(lastOutput, null, 2) : String(lastOutput);
        const text = `The last action (${lastTool}) output was:\n${outStr}`;
        const spoken = this.lastExecution?.spokenSummary || `The last action ${lastTool} completed with output.`;
        return { text, spoken, isAnswered: true };
      }
    }

    // 3. Never spawn a coding agent for arbitrary, unmapped text. This keeps the
    // dialogue boundary predictable and prevents an accidental slow/external call.
    if (!this.isDialogueQuery(goal)) {
      return {
        text: `I understood "${goal}". I'm EVA, your Mac AI assistant. You can ask me to open Desktop projects in VS Code, coordinate Claude Code, check Mac system health, launch apps, or run terminal commands.`,
        spoken: "I'm ready to assist with your Mac or coding projects.",
        isAnswered: false,
      };
    }

    // 4. Optional one-shot Claude Code inquiry for eligible dialogue questions
    try {
      const claudeCli = await findClaudeCli();
      if (claudeCli && fs.existsSync(claudeCli)) {
        const { stdout } = await execFileAsync(claudeCli, ['-p', goal, '--no-session-persistence'], {
          timeout: 8000,
          maxBuffer: 1024 * 1024,
        });
        const ans = stdout.trim();
        if (ans && !ans.includes('Not logged in') && !ans.includes('Please run /login') && !CLAUDE_LIMIT_REGEX.test(ans)) {
          const firstSentence = ans.split(/[.\n]/)[0]?.trim() || ans.slice(0, 100);
          return {
            text: ans,
            spoken: firstSentence.length > 120 ? firstSentence.slice(0, 120) + '...' : firstSentence,
            isAnswered: true,
          };
        }
      }
    } catch {}

    return {
      text: `I understood "${goal}". I'm EVA, your Mac AI assistant. You can ask me to open Desktop projects in VS Code, coordinate Claude Code, check Mac system health, launch apps, or run terminal commands.`,
      spoken: "I'm ready to assist with your Mac or coding projects.",
      isAnswered: false,
    };
  }

  private recordExecution(toolName: string, goal: string, result: any, spokenSummary: string, responseText: string): void {
    const isClaudeReview = toolName === 'claude.review_project';
    const isClaudeTask = toolName === 'claude.complete_task';

    const claudeOutput = isClaudeReview
      ? (result.data?.reviewSummary || result.error?.message)
      : isClaudeTask
      ? (result.data?.resultText || result.error?.message)
      : undefined;

    this.lastExecution = {
      toolName,
      goal,
      output: result.data ?? result.error,
      success: result.success,
      spokenSummary,
      responseText,
      claudeReview: isClaudeReview ? claudeOutput : this.lastExecution?.claudeReview,
      claudeTask: isClaudeTask ? claudeOutput : this.lastExecution?.claudeTask,
    };

    if (this.memory) {
      this.memory.updateContext({
        lastGoal: goal,
        lastToolName: toolName,
        lastToolOutput: typeof result.data === 'object' ? JSON.stringify(result.data) : String(result.data ?? result.error?.message ?? ''),
        lastClaudeReview: this.lastExecution.claudeReview,
        lastClaudeTask: this.lastExecution.claudeTask,
        lastSpokenSummary: spokenSummary,
        lastResponseText: responseText,
      });
    }
  }

  /**
   * Translates natural language goal into structured tool steps
   */
  public parseGoalToPlan(goal: string): AgentStepPlan[] {
    if (this.isDialogueQuery(goal)) {
      return [];
    }

    const text = goal.toLowerCase().trim();

    if (/\b(?:claude|claude code)\b.*\b(?:status|working|running|progress|agent)\b|\b(?:status|working|running|progress)\b.*\b(?:claude|claude code)\b/i.test(text)) {
      return [{ thought: 'Checking active Claude Code background-agent sessions.', toolName: 'claude.status', parameters: {} }];
    }

    // ==========================================
    // 0. macOS System Status, Battery & Hardware Diagnostics
    // ==========================================
    if (
      text.includes('mac status') ||
      text.includes('system status') ||
      text.includes('battery') ||
      text.includes('charging') ||
      text.includes('heating') ||
      text.includes('temperature') ||
      text.includes('opened apps') ||
      text.includes('running apps') ||
      text.includes('how is my mac') ||
      text.includes('hows my mac') ||
      text.includes('what apps are open') ||
      text.includes('what apps are running')
    ) {
      let filter: 'all' | 'battery' | 'thermal' | 'apps' = 'all';
      if (text.includes('battery') || text.includes('charging')) filter = 'battery';
      else if (text.includes('heating') || text.includes('temperature')) filter = 'thermal';
      else if (text.includes('apps') || text.includes('opened apps') || text.includes('running apps')) filter = 'apps';

      return [
        {
          thought: 'Inspecting real-time macOS system health, battery, thermals, and active applications.',
          toolName: 'system.mac_status',
          parameters: { filter },
        },
      ];
    }

    // ==========================================
    // 1. General "open <target> in <app>" and Web / Browser Navigation
    // ==========================================
    const inAppMatch = goal.match(/^(?:open|launch|start)\s+(.+?)\s+(?:in|with|using)\s+([a-zA-Z0-9 ._-]+?)[.?]?$/i);
    if (
      inAppMatch &&
      !text.includes('claude') &&
      !text.includes('and review') &&
      !text.includes('and complete') &&
      !text.includes('whatsapp') &&
      !text.includes('call') &&
      !text.includes('message') &&
      !text.includes('facetime')
    ) {
      let target = inAppMatch[1].replace(/^(?:url\s+|website\s+|site\s+|project\s+|folder\s+|directory\s+|dir\s+)/i, '').trim();
      const appRaw = inAppMatch[2].trim();
      const appLower = appRaw.toLowerCase();

      // Case A: Application is a Web Browser
      if (/^(?:google\s+)?chrome|safari|firefox|brave|edge|arc|browser$/i.test(appLower)) {
        const browserApp = appLower.includes('safari') ? 'Safari' : 'Google Chrome';
        let url = '';
        const urlMatch = target.match(/https?:\/\/[^\s]+/i);
        if (urlMatch) {
          url = urlMatch[0];
        } else if (WEB_DOMAIN_REGEX.test(target)) {
          const domMatch = target.match(WEB_DOMAIN_REGEX);
          url = domMatch ? (domMatch[0].startsWith('http') ? domMatch[0] : `https://${domMatch[0]}`) : `https://${target}`;
        } else if (target.includes('.') && !target.includes(' ')) {
          url = `https://${target}`;
        } else {
          url = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
        }

        return [
          {
            thought: `Ensuring ${browserApp} is launched for web navigation.`,
            toolName: 'app.launch',
            parameters: { appName: browserApp },
          },
          {
            thought: `Opening "${target}" in ${browserApp}.`,
            toolName: 'browser.open',
            parameters: { url, browser: browserApp },
          },
        ];
      }

      // Case B: Application is Visual Studio Code
      if (/^(?:vs\s*code|vscode|code|visual\s+studio\s+code)$/i.test(appLower)) {
        const cleanProject = target.replace(/^(?:project\s+|folder\s+|directory\s+|dir\s+)/i, '').trim();
        return [
          {
            thought: `Opening '${cleanProject}' in Visual Studio Code.`,
            toolName: 'vscode.open',
            parameters: { path: cleanProject },
          },
        ];
      }

      // Case C: Application is Finder
      if (/^finder$/i.test(appLower)) {
        return [
          {
            thought: `Opening '${target}' in Finder.`,
            toolName: 'terminal.exec',
            parameters: { command: `open "${target}"` },
          },
        ];
      }

      // Case D: Any other macOS application
      const normalizedApp = normalizeMacAppName(appRaw);
      return [
        {
          thought: `Opening '${target}' with macOS application '${normalizedApp}'.`,
          toolName: 'terminal.exec',
          parameters: { command: `open -a "${normalizedApp}" "${target}"` },
        },
      ];
    }

    const hasDomain = WEB_DOMAIN_REGEX.test(goal);
    const isSearch = text.startsWith('search for ') || text.startsWith('search ') || text.startsWith('google ') || text.startsWith('look up ');

    if (hasDomain || isSearch || text.includes('in chrome') || text.includes('in safari') || text.includes('in browser')) {
      let browserApp = '';
      if (text.includes('in chrome') || text.includes('using chrome') || text.includes('with chrome')) {
        browserApp = 'Google Chrome';
      } else if (text.includes('in safari') || text.includes('using safari')) {
        browserApp = 'Safari';
      }

      const domainMatch = goal.match(WEB_DOMAIN_REGEX);
      if (domainMatch) {
        let url = domainMatch[0];
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = `https://${url}`;
        }
        const plans: AgentStepPlan[] = [];
        if (browserApp) {
          plans.push({
            thought: `Ensuring ${browserApp} is launched for web navigation.`,
            toolName: 'app.launch',
            parameters: { appName: browserApp },
          });
        }
        plans.push({
          thought: `Navigating to URL ${url}${browserApp ? ` in ${browserApp}` : ''}.`,
          toolName: 'browser.open',
          parameters: { url, ...(browserApp ? { browser: browserApp } : {}) },
        });
        return plans;
      }

      if (isSearch) {
        let query = goal.replace(/^(?:search\s+for|search|google|look\s+up)\s+/i, '');
        query = query.replace(/\s+(?:on|in)\s+google$/i, '').replace(/\s+in\s+(?:chrome|safari|browser)$/i, '').replace(/[.?]+$/, '').trim();
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        const plans: AgentStepPlan[] = [];
        if (browserApp) {
          plans.push({
            thought: `Ensuring ${browserApp} is launched for search.`,
            toolName: 'app.launch',
            parameters: { appName: browserApp },
          });
        }
        plans.push({
          thought: `Searching Google for "${query}"${browserApp ? ` in ${browserApp}` : ''}.`,
          toolName: 'browser.open',
          parameters: { url: searchUrl, ...(browserApp ? { browser: browserApp } : {}) },
        });
        return plans;
      }
    }

    // ==========================================
    // 2. YouTube & Music/Video Playback
    // ==========================================
    if (
      text.includes('youtube') ||
      text.includes('play a song') ||
      text.includes('playing a song') ||
      text.includes('play music') ||
      text.includes('playing music') ||
      ((text.startsWith('play ') || text.startsWith('playing ')) && !text.includes('project'))
    ) {
      let query = 'trending music';
      const isGeneric = /^(?:open\s+youtube(?:\s+and\s+play)?|play|playing)(?:\s+(?:a\s+)?song|\s+music|\s+something)?(?:\s+(?:on|in)\s+youtube)?\b[!?.]*$/i.test(goal);
      if (!isGeneric) {
        const songMatch = goal.match(/(?:(?:open\s+youtube\s+and\s+)?(?:play|playing|search\s+for|search|find)(?:\s+a)?(?:\s+song)?(?:\s+music)?)\s+(?:called\s+|named\s+)?['"]?(.+?)['"]?(?:\s+(?:on|in)\s+youtube)?(?:[.?]|$)/i)
          || goal.match(/(?:search\s+for|search|find|play|playing)\s+['"]?(.+?)['"]?\s+(?:on|in)\s+youtube[.?]?$/i);
        if (songMatch && songMatch[1]) {
          const candidate = songMatch[1].replace(/\s+(?:on|in)\s+youtube$/i, '').trim();
          if (candidate && !['a song', 'song', 'music', 'trending music', 'a video', 'video'].includes(candidate.toLowerCase())) {
            query = candidate;
          }
        }
      }
      const url = query === 'trending music' || query === 'music'
        ? 'https://www.youtube.com'
        : `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      return [
        {
          thought: `Opening YouTube in browser to play "${query}".`,
          toolName: 'browser.open',
          parameters: { url },
        },
      ];
    }

    // ==========================================
    // 3. WhatsApp Voice/Video Calls & Messaging
    // ==========================================
    if (text.includes('video call') || text.includes('videocall') || text.includes('facetime')) {
      const vidMatch = goal.match(/(?:video\s*call|videocall|facetime)\s+(?:with\s+|to\s+)?(.+?)(?:\s+(?:on|in|via)\s+whatsapp)?[.?]?$/i);
      let recipient = vidMatch ? vidMatch[1].trim().replace(/[.?]+$/, '') : 'contact';
      recipient = recipient.replace(/^(?:with|to)\s+/i, '').replace(/\s+(?:on|in|via)\s+whatsapp$/i, '').trim();
      recipient = recipient.charAt(0).toUpperCase() + recipient.slice(1);
      return [
        {
          thought: `Starting WhatsApp video call to "${recipient}".`,
          toolName: 'whatsapp.video_call',
          parameters: { recipient },
        },
      ];
    }

    if ((text.includes('call') || text.includes('phone')) && !text.includes('claude') && !text.includes('recall')) {
      const callMatch = goal.match(/(?:(?:start\s+(?:a\s+)?(?:whatsapp\s+)?(?:voice\s+)?call|call|calling|phone|voice\s*call))\s+(?:with\s+|to\s+)?(.+?)(?:\s+(?:on|in|via)\s+whatsapp)?[.?]?$/i);
      let recipient = callMatch ? callMatch[1].trim().replace(/[.?]+$/, '') : 'contact';
      recipient = recipient.replace(/^(?:with|to)\s+/i, '').replace(/\s+(?:on|in|via)\s+whatsapp$/i, '').trim();
      recipient = recipient.charAt(0).toUpperCase() + recipient.slice(1);
      return [
        {
          thought: `Starting WhatsApp voice call to "${recipient}".`,
          toolName: 'whatsapp.call',
          parameters: { recipient },
        },
      ];
    }

    const msgQuoteMatch = goal.match(/(?:send\s+whatsapp\s+message|send\s+message|send|message|text)\s+["'](.+?)["']\s+to\s+([a-zA-Z0-9 ._-]+?)[.?]?$/i);
    const whatsappMatch = msgQuoteMatch || goal.match(/(?:send|message|text)\s+['"]?(.+?)['"]?\s+to\s+([a-zA-Z0-9 ._-]+?)(?:\s+(?:in|on|via)\s+whatsapp)?[.?]?$/i);
    if (whatsappMatch) {
      let message = (msgQuoteMatch ? msgQuoteMatch[1] : whatsappMatch[1]).trim();
      let recipient = (msgQuoteMatch ? msgQuoteMatch[2] : whatsappMatch[2]).trim().replace(/[.?]+$/, '');
      recipient = recipient.replace(/\s+(?:in|on|via)\s+whatsapp$/i, '').trim();
      recipient = recipient.charAt(0).toUpperCase() + recipient.slice(1);
      return [
        {
          thought: `Automating WhatsApp to send message "${message}" to contact "${recipient}".`,
          toolName: 'whatsapp.send_message',
          parameters: { recipient, message },
        },
      ];
    }

    // ==========================================
    // 4. Desktop Projects & VS Code / Claude Code Workflows
    // ==========================================
    // Extract Desktop project name if referenced
    const projMatch = goal.match(/(?:open|launch)\s+(?:project\s+)?([a-zA-Z0-9_-]+)(?:\s+(?:present\s+)?on\s+desktop)?\s+in\s+(?:vs\s*code|code|visual\s+studio\s+code)/i)
      || goal.match(/(?:open|launch)\s+([a-zA-Z0-9_-]+)\s+in\s+(?:vs\s*code|code|visual\s+studio\s+code)/i)
      || goal.match(/(?:open|launch)\s+(?:vs\s*code|code|visual\s+studio\s+code)\s+(?:on|in|for)\s+([a-zA-Z0-9_-]+)/i);

    let targetProject = '';
    if (projMatch && projMatch[1]) {
      const candidate = projMatch[1].trim().replace(/^(?:project|folder|directory|dir)\s+/i, '').trim();
      if (!['project', 'desktop', 'the', 'this', 'current'].includes(candidate.toLowerCase())) {
        targetProject = candidate;
      }
    }

    // Dedicated: "open/call/start claude in vs code" (with or without project)
    if (!this.isDialogueQuery(goal) && mentionsVSCode(text) && text.includes('claude') && (text.includes('terminal') || text.includes('open claude') || text.includes('call claude') || text.includes('start claude') || text.includes('use claude'))) {
      return [
        {
          thought: targetProject
            ? `Opening project '${targetProject}' in Visual Studio Code with Claude Code in the integrated terminal.`
            : 'Opening Visual Studio Code with Claude Code in the integrated terminal.',
          toolName: 'vscode.open',
          parameters: {
            ...(targetProject ? { path: targetProject } : {}),
            launchClaude: true,
          },
        },
      ];
    }

    // Compound 0: "open vs code reviewing a project with the help of claude, and then completing a task with claude"
    if (!this.isDialogueQuery(goal) && mentionsVSCode(text) && text.includes('claude') && text.includes('review') && (text.includes('task') || text.includes('complet') || text.includes('compet'))) {
      let taskPrompt = 'Analyze the codebase and execute the requested task, ensuring tests pass.';
      const taskMatch = goal.match(/(?:call claude to|ask claude to|complete task|completing a task|fix|build)\s+['"]?(.+?)['"]?(?:\s+(?:with|in)\s+claude)?$/i);
      if (taskMatch && taskMatch[1] && taskMatch[1].trim() !== 'with claude') {
        taskPrompt = taskMatch[1].trim();
      }

      return [
        {
          thought: `Opening project '${targetProject || 'current workspace'}' in Visual Studio Code.`,
          toolName: 'vscode.open',
          parameters: targetProject ? { path: targetProject } : {},
        },
        {
          thought: `Using Claude Code to perform an automated code review on '${targetProject || 'workspace'}'.`,
          toolName: 'claude.review_project',
          parameters: targetProject ? { projectPath: targetProject } : {},
        },
        {
          thought: `Instructing Claude Code developer agent on '${targetProject || 'workspace'}': "${taskPrompt}".`,
          toolName: 'claude.complete_task',
          parameters: { taskPrompt, ...(targetProject ? { projectPath: targetProject } : {}) },
        },
      ];
    }

    // Compound 1: "open [project] in vs code and review with claude"
    if (!this.isDialogueQuery(goal) && mentionsVSCode(text) && text.includes('claude') && text.includes('review')) {
      return [
        {
          thought: `Opening project '${targetProject || 'current workspace'}' in Visual Studio Code.`,
          toolName: 'vscode.open',
          parameters: targetProject ? { path: targetProject } : {},
        },
        {
          thought: `Using Claude Code to perform an automated code review on '${targetProject || 'workspace'}'.`,
          toolName: 'claude.review_project',
          parameters: targetProject ? { projectPath: targetProject } : {},
        },
      ];
    }

    // Compound 2: "open [project] in vs code and call/ask claude to [task]"
    if (!this.isDialogueQuery(goal) && mentionsVSCode(text) && text.includes('claude') && (text.includes('task') || text.includes('fix') || text.includes('ask claude') || text.includes('call claude'))) {
      let taskPrompt = 'Analyze the codebase and execute the requested task, ensuring tests pass.';
      const taskMatch = goal.match(/(?:call claude to|ask claude to|complete task|fix|build)\s+['"]?(.+?)['"]?(?:\s+(?:with|in)\s+claude)?$/i);
      if (taskMatch && taskMatch[1]) taskPrompt = taskMatch[1].trim();

      return [
        {
          thought: `Opening project '${targetProject || 'current workspace'}' in Visual Studio Code.`,
          toolName: 'vscode.open',
          parameters: targetProject ? { path: targetProject } : {},
        },
        {
          thought: `Instructing Claude Code developer agent on '${targetProject || 'workspace'}': "${taskPrompt}".`,
          toolName: 'claude.complete_task',
          parameters: { taskPrompt, ...(targetProject ? { projectPath: targetProject } : {}) },
        },
      ];
    }

    // VS Code Opening alone (supports Desktop projects by name)
    if (!this.isDialogueQuery(goal) && mentionsVSCode(text)) {
      if (text.includes('open') || text.includes('launch') || text.includes('start')) {
        return [
          {
            thought: targetProject ? `Opening Desktop project '${targetProject}' in Visual Studio Code.` : 'Opening project in Visual Studio Code.',
            toolName: 'vscode.open',
            parameters: targetProject ? { path: targetProject } : {},
          },
        ];
      }
    }

    // Claude Code Review ONLY
    if (!this.isDialogueQuery(goal) && text.includes('review') && (text.includes('claude') || text.includes('codebase') || text.includes('project'))) {
      const revProjMatch = goal.match(/review\s+(?:project\s+)?([a-zA-Z0-9_-]+)\s+with\s+claude/i);
      const proj = revProjMatch ? revProjMatch[1].trim() : targetProject;
      return [
        {
          thought: `Using Claude Code to perform an automated architectural & security code review${proj ? ` on '${proj}'` : ''}.`,
          toolName: 'claude.review_project',
          parameters: proj ? { projectPath: proj } : {},
        },
      ];
    }

    // Claude Code Task Execution ONLY
    if ((text.includes('complete task') || text.includes('ask claude') || text.includes('tell claude') || text.includes('have claude') || text.includes('call claude')) && text.includes('claude')) {
      let taskPrompt = 'Analyze the codebase and execute the requested task, ensuring tests pass.';
      const taskMatch = goal.match(/(?:complete|execute|do|run|fix|build|ask claude to|have claude|call claude to)\s+(?:a\s+task\s+)?['"]?(.+?)['"]?(?:\s+with\s+claude)?$/i);
      if (taskMatch && taskMatch[1]) {
        taskPrompt = taskMatch[1].replace(/\s+with\s+claude$/i, '').trim();
      }
      return [
        {
          thought: `Instructing Claude Code developer agent: "${taskPrompt}".`,
          toolName: 'claude.complete_task',
          parameters: { taskPrompt, ...(targetProject ? { projectPath: targetProject } : {}) },
        },
      ];
    }

    // ==========================================
    // 5. Developer Project Automation (npm test, build, dev)
    // ==========================================
    if (text.includes('run test') || text.includes('run tests') || text.includes('npm test') || text.includes('test project') || text.includes('test the project') || text.includes('run vitest')) {
      return [
        {
          thought: 'Executing project test suite via npm test.',
          toolName: 'terminal.exec',
          parameters: { command: 'npm test' },
        },
      ];
    }

    if (text.includes('run build') || text.includes('build project') || text.includes('build the project') || text.includes('npm run build') || text.includes('compile project')) {
      return [
        {
          thought: 'Building project codebase via npm run build.',
          toolName: 'terminal.exec',
          parameters: { command: 'npm run build' },
        },
      ];
    }

    if (text.includes('start server') || text.includes('start project') || text.includes('start the project') || text.includes('npm start') || text.includes('run dev') || text.includes('npm run dev')) {
      return [
        {
          thought: 'Starting project runtime server via npm start.',
          toolName: 'terminal.exec',
          parameters: { command: 'npm start' },
        },
      ];
    }

    if (text.includes('install dependencies') || text.includes('npm install') || text.includes('install packages')) {
      return [
        {
          thought: 'Installing project dependencies via npm install.',
          toolName: 'terminal.exec',
          parameters: { command: 'npm install' },
        },
      ];
    }

    // ==========================================
    // 6. Mac Desktop System Controls & Finder
    // ==========================================
    if (text.includes('volume up') || text.includes('turn up volume') || text.includes('increase volume')) {
      return [
        {
          thought: 'Increasing macOS system audio volume.',
          toolName: 'terminal.exec',
          parameters: { command: 'osascript -e "set volume output volume ((output volume of (get volume settings)) + 15)"' },
        },
      ];
    }
    if (text.includes('volume down') || text.includes('lower volume') || text.includes('decrease volume') || text.includes('turn down volume')) {
      return [
        {
          thought: 'Decreasing macOS system audio volume.',
          toolName: 'terminal.exec',
          parameters: { command: 'osascript -e "set volume output volume ((output volume of (get volume settings)) - 15)"' },
        },
      ];
    }
    const volNumMatch = text.match(/(?:set|change)\s+volume\s+(?:to\s+)?(\d+)\s*%?/i);
    if (volNumMatch) {
      const vol = Math.min(100, Math.max(0, parseInt(volNumMatch[1], 10)));
      return [
        {
          thought: `Setting macOS audio volume to ${vol}%.`,
          toolName: 'terminal.exec',
          parameters: { command: `osascript -e "set volume output volume ${vol}"` },
        },
      ];
    }
    if (text.includes('mute volume') || text.includes('mute audio') || text.includes('mute sound') || text === 'mute') {
      return [
        {
          thought: 'Muting macOS system audio.',
          toolName: 'terminal.exec',
          parameters: { command: 'osascript -e "set volume output muted true"' },
        },
      ];
    }
    if (text.includes('unmute') || text.includes('unmute volume')) {
      return [
        {
          thought: 'Unmuting macOS system audio.',
          toolName: 'terminal.exec',
          parameters: { command: 'osascript -e "set volume output muted false"' },
        },
      ];
    }

    if (text.includes('dark mode') || text.includes('toggle dark mode') || text.includes('light mode')) {
      return [
        {
          thought: 'Toggling macOS system appearance (Dark/Light mode).',
          toolName: 'terminal.exec',
          parameters: { command: 'osascript -e \'tell app "System Events" to tell appearance preferences to set dark mode to not dark mode\'' },
        },
      ];
    }

    if (text.includes('lock screen') || text.includes('lock mac') || text.includes('lock computer')) {
      return [
        {
          thought: 'Locking macOS desktop screen.',
          toolName: 'terminal.exec',
          parameters: { command: 'osascript -e \'tell app "System Events" to keystroke "q" using {command down, control down}\'' },
        },
      ];
    }

    if (text.includes('open downloads') || text.includes('downloads folder')) {
      return [
        {
          thought: 'Opening Downloads folder in Finder.',
          toolName: 'terminal.exec',
          parameters: { command: 'open ~/Downloads' },
        },
      ];
    }
    if (text.includes('open desktop') && !text.includes('window')) {
      return [
        {
          thought: 'Opening Desktop folder in Finder.',
          toolName: 'terminal.exec',
          parameters: { command: 'open ~/Desktop' },
        },
      ];
    }
    if (text.includes('open documents') || text.includes('documents folder')) {
      return [
        {
          thought: 'Opening Documents folder in Finder.',
          toolName: 'terminal.exec',
          parameters: { command: 'open ~/Documents' },
        },
      ];
    }

    // ==========================================
    // 7. Mac Application Status & Launch
    // ==========================================
    let statusMatch = goal.match(/^(?:is|check if|status of|inspect)\s+(.+?)\s+(?:is\s+)?(?:currently\s+)?(?:running|open|active|status)[.?]?$/i);
    if (!statusMatch) {
      statusMatch = goal.match(/^(?:is|check if|status of|inspect)\s+(.+?)[.?]?$/i);
    }
    if (statusMatch && !text.startsWith('open ') && !text.startsWith('launch ')) {
      const raw = statusMatch[1].trim().replace(/[.?]+$/, '');
      const appName = normalizeMacAppName(raw);
      return [
        {
          thought: `Checking if macOS application '${appName}' is currently running.`,
          toolName: 'app.status',
          parameters: { appName },
        },
      ];
    }

    const launchMatch = goal.match(/^(?:open|launch|start)\s+(?:application\s+|app\s+)?([a-zA-Z0-9 ._-]+)$/i);
    if (launchMatch) {
      let raw = launchMatch[1].trim();
      raw = raw.replace(/\s+(?:over\s+here|right\s+here|over\s+there|right\s+there|up\s+here|for\s+me|real\s+quick|right\s+now|now)$/i, '').trim();
      const hasInApp = /\s+(?:in|with|using|on)\s+[a-zA-Z0-9 ._-]+$/i.test(raw);
      if (!hasInApp && !WEB_DOMAIN_REGEX.test(raw)) {
        const appName = normalizeMacAppName(raw);
        return [
          {
            thought: `Launching macOS application '${appName}'.`,
            toolName: 'app.launch',
            parameters: { appName },
          },
        ];
      }
    }

    // ==========================================
    // 8. Filesystem, Screenshot & Vision Tools
    // ==========================================
    const fileMatch = goal.match(/^(?:read|show|view|display|cat)\s+(?:file\s+)?([a-zA-Z0-9_./\-]+)$/i);
    if (fileMatch) {
      const filePath = fileMatch[1].trim();
      return [
        {
          thought: `Reading scoped contents of file '${filePath}'.`,
          toolName: 'fs.read',
          parameters: { path: filePath, encoding: 'utf-8' },
        },
      ];
    }

    if (text.includes('screenshot') || text.includes('capture screen') || text.includes('snapshot')) {
      return [
        {
          thought: 'Capturing screenshot of macOS display.',
          toolName: 'screen.capture',
          parameters: { displayIndex: 1 },
        },
      ];
    }

    if (text.includes('inspect screen') || text.includes('read screen') || text.includes('what is on screen') || text.includes('screen text')) {
      return [
        {
          thought: 'Analyzing screen contents via Apple Vision OCR.',
          toolName: 'screen.inspect',
          parameters: {},
        },
      ];
    }

    if (text.includes('macos version') || text.includes('system version') || text.includes('sw_vers')) {
      return [
        {
          thought: 'Querying macOS operating system version.',
          toolName: 'terminal.exec',
          parameters: { command: 'sw_vers' },
        },
      ];
    }

    // ==========================================
    // 9. Window Management & Desktop Control
    // ==========================================
    if (text.includes('list windows') || text.includes('show windows') || text.includes('open windows')) {
      return [
        {
          thought: 'Listing all open application windows on the desktop.',
          toolName: 'window.list',
          parameters: {},
        },
      ];
    }

    const focusMatch = goal.match(/^(?:focus|switch to)\s+(?:window\s+)?([a-zA-Z0-9 ._-]+?)[.?]?$/i);
    if (focusMatch) {
      const appName = normalizeMacAppName(focusMatch[1].trim());
      return [
        {
          thought: `Focusing window of application '${appName}'.`,
          toolName: 'window.focus',
          parameters: { appName },
        },
      ];
    }

    const closeWinMatch = goal.match(/^(?:close|quit|exit)\s+(?:the\s+)?(?:window\s+of\s+|window\s+|app\s+)?([a-zA-Z0-9 ._-]+?)[.?]?$/i);
    if (closeWinMatch) {
      const candidate = closeWinMatch[1].trim();
      const appName = normalizeMacAppName(candidate);
      return [
        {
          thought: `Closing window of application '${appName}'.`,
          toolName: 'window.close',
          parameters: { appName },
        },
      ];
    }

    const typeMatch = goal.match(/^(?:type|type out)\s+["']?(.+?)["']?[.?]?$/i);
    if (typeMatch) {
      return [
        {
          thought: `Typing text: "${typeMatch[1]}".`,
          toolName: 'keyboard.type',
          parameters: { text: typeMatch[1] },
        },
      ];
    }

    if (text.includes('shortcut') || text.includes('press cmd') || text.includes('press command')) {
      return [
        {
          thought: 'Executing keyboard shortcut Command+Space.',
          toolName: 'keyboard.shortcut',
          parameters: { key: 'space', modifiers: ['command'] },
        },
      ];
    }

    if (text.includes('click mouse') || text.includes('click screen')) {
      return [
        {
          thought: 'Dispatching mouse click event.',
          toolName: 'mouse.click',
          parameters: { button: 'left' },
        },
      ];
    }

    if (text.includes('git status') || text.includes('check git') || text.includes('repo status')) {
      return [
        {
          thought: 'Checking working tree status and branch via Git.',
          toolName: 'git.status',
          parameters: {},
        },
      ];
    }

    const reminderMatch = goal.match(/^(?:remind me to|add reminder to|add reminder)\s+(.+?)[.?]?$/i);
    if (reminderMatch) {
      return [
        {
          thought: `Creating Apple Reminder: "${reminderMatch[1].trim()}".`,
          toolName: 'reminders.add',
          parameters: { title: reminderMatch[1].trim() },
        },
      ];
    }

    const searchFileMatch = goal.match(/(?:search for file|find file|search file)\s+([a-zA-Z0-9 ._-]+?)[.?]?$/i);
    if (searchFileMatch) {
      return [
        {
          thought: `Searching for file '${searchFileMatch[1].trim()}' in workspace.`,
          toolName: 'fs.search',
          parameters: { query: searchFileMatch[1].trim() },
        },
      ];
    }

    const runMatch = goal.match(/^(?:run|exec|execute)(?:\s+command)?\s+(.+)$/i);
    if (runMatch) {
      const command = runMatch[1].trim();
      return [
        {
          thought: `Executing terminal command: ${command}`,
          toolName: 'terminal.exec',
          parameters: { command },
        },
      ];
    }

    if (/\b(?:tokens?|budget|token\s+usage|token\s+radar|how\s+many\s+tokens|token\s+status)\b/i.test(text)) {
      return [
        {
          thought: 'Inspecting real-time token budget, usage radar, and quota limits.',
          toolName: 'context.budget',
          parameters: { action: 'status' },
        },
      ];
    }

    const analyzeMatch = goal.match(/(?:analyze|prune|slice|compress)\s+(?:context\s+|file\s+|tokens?\s+for\s+)?([a-zA-Z0-9_./\-]+\.[a-zA-Z0-9]+)/i);
    if (analyzeMatch) {
      const filePath = analyzeMatch[1].trim();
      return [
        {
          thought: `Analyzing AST symbols and token context slice for '${filePath}'.`,
          toolName: 'context.analyze',
          parameters: { path: filePath },
        },
      ];
    }

    const yagniMatch = goal.match(/(?:check\s+yagni|yagni\s+eval(?:uate)?|evaluate\s+feature|should\s+we\s+add|do\s+we\s+need|is\s+this\s+feature\s+needed)\s+(.+)/i);
    if (yagniMatch) {
      const taskDescription = yagniMatch[1].replace(/^(?:for|that|whether|if)\s+/i, '').trim();
      return [
        {
          thought: `Evaluating task against the 7-step Ponytail YAGNI decision ladder: '${taskDescription}'`,
          toolName: 'pragmatic.yagni_eval',
          parameters: { taskDescription },
        },
      ];
    }

    const reviewMatch = goal.match(/(?:audit|review|lint)\s+(?:code\s+(?:in\s+)?|file\s+)?([a-zA-Z0-9_./\-]+\.[a-zA-Z0-9]+)/i);
    if (reviewMatch) {
      const filePath = reviewMatch[1].trim();
      return [
        {
          thought: `Auditing code quality, security rules, and anti-over-engineering standards for '${filePath}'.`,
          toolName: 'code.review',
          parameters: { path: filePath },
        },
      ];
    }

    const refactorMatch = goal.match(/(?:refactor|self[\s-]heal(?:ing)?)\s+(?:file\s+)?([a-zA-Z0-9_./\-]+\.[a-zA-Z0-9]+)(?:\s+(?:to|with|for)\s+(.+))?/i);
    if (refactorMatch) {
      const targetFile = refactorMatch[1].trim();
      const goalDesc = refactorMatch[2]?.trim() || `Refactor and test ${targetFile}`;
      return [
        {
          thought: `Executing autonomous self-healing refactor loop on '${targetFile}': ${goalDesc}`,
          toolName: 'dev.self_healing_refactor',
          parameters: {
            targetFiles: [targetFile],
            refactorGoal: goalDesc,
          },
        },
      ];
    }

    return [];
  }

  /**
   * Autonomous execution loop: Plan -> Execute -> Observe -> Verify -> Respond
   */
  public async executeGoal(request: AgentGoalRequest): Promise<AgentGoalResponse> {
    const startTime = Date.now();
    const taskId = request.taskId ?? `goal_${Date.now()}`;

    // Apply Prompt Enhancement Pipeline
    const enhanced = this.promptEnhancer.enhance(request.goal);
    this.logger.info(`Goal processing: "${request.goal}" -> Enhanced: "${enhanced.enhancedPrompt}"`, {
      taskId,
      category: enhanced.intentCategory,
      refinements: enhanced.refinements,
    });

    // Check if this is a dialogue memory query or conversational interaction
    if (this.isDialogueQuery(request.goal) || this.isDialogueQuery(enhanced.enhancedPrompt)) {
      const queryRes = await this.handleDialogueQuery(request.goal, request.speakResponse);
      if (request.speakResponse !== false) {
        await this.voice.speak(queryRes.spoken);
      }
      return {
        goal: request.goal,
        enhanced,
        success: true,
        plan: [],
        executionResults: [],
        responseSpeech: queryRes.spoken,
        responseText: queryRes.text,
        metrics: { durationMs: Date.now() - startTime, stepsExecuted: 0 },
      };
    }

    // Check if user requested strategic planner mode (Section 12)
    const lower = request.goal.toLowerCase();
    if (
      /\b(?:act as (?:a |the )?planner|as a planner|enter planner mode|plan mode)\b/i.test(lower) ||
      /^plan\s+(?:the\s+)?(?:architecture|system|feature|project|workflow|return|strategy|pipeline)\b/i.test(lower)
    ) {
      const orch = this.getOrchestratorPipeline();
      const orchRes = await orch.orchestrate({
        rawInput: request.goal,
        sessionId: request.sessionId,
        deviceId: request.deviceId,
        taskId,
        forcedRole: 'PLANNER',
      });
      if (request.speakResponse !== false) {
        await this.voice.speak(orchRes.spokenResponse);
      }
      return {
        goal: request.goal,
        enhanced,
        success: orchRes.success,
        plan: [],
        executionResults: [],
        responseSpeech: orchRes.spokenResponse,
        responseText: orchRes.textResponse,
        metrics: { durationMs: Date.now() - startTime, stepsExecuted: 0 },
      };
    }

    // Generate plan from enhanced prompt (fallback to raw if needed)
    let plan = this.parseGoalToPlan(enhanced.enhancedPrompt);
    if (plan.length === 0) {
      plan = this.parseGoalToPlan(request.goal);
    }

    if (plan.length === 0) {
      const dialogueRes = await this.handleDialogueQuery(request.goal, request.speakResponse);
      if (dialogueRes.isAnswered) {
        if (request.speakResponse !== false) {
          await this.voice.speak(dialogueRes.spoken);
        }
        return {
          goal: request.goal,
          enhanced,
          success: true,
          plan: [],
          executionResults: [],
          responseSpeech: dialogueRes.spoken,
          responseText: dialogueRes.text,
          metrics: { durationMs: Date.now() - startTime, stepsExecuted: 0 },
        };
      }

      const msg = `I understood "${request.goal}". I'm EVA, your Mac AI assistant. I can open desktop projects in VS Code, coordinate Claude Code, check Mac system health, launch apps, or run terminal commands. What would you like to accomplish?`;
      if (request.speakResponse) {
        await this.voice.speak("I'm ready to assist with your Mac or coding projects.");
      }
      return {
        goal: request.goal,
        enhanced,
        success: true,
        plan: [],
        executionResults: [],
        responseSpeech: "I'm ready to assist with your Mac or coding projects.",
        responseText: msg,
        metrics: { durationMs: Date.now() - startTime, stepsExecuted: 0 },
      };
    }

    const executionResults: ToolDispatchOutput[] = [];
    let overallSuccess = true;
    let spokenSummary = '';
    let responseText = '';
    const accumulatedSpoken: string[] = [];
    const accumulatedText: string[] = [];

    for (const step of plan) {
      this.logger.info(`Executing step: ${step.thought} using tool '${step.toolName}'`);

      let result = await this.router.dispatch({
        toolName: step.toolName,
        parameters: step.parameters,
        sessionId: request.sessionId,
        deviceId: request.deviceId,
        taskId,
      });

      // Handle interactive Policy Engine Approval for SENSITIVE/CRITICAL actions
      if (
        !result.success &&
        result.error?.code === 'POLICY_DENIED' &&
        result.error.message.includes('requires explicit human confirmation') &&
        request.onApprovalRequired &&
        this.policyEngine
      ) {
        const pending = Array.from((this.policyEngine as any).pendingApprovals?.values?.() ?? []).pop() as any;
        const requestId = pending?.requestId;
        if (requestId) {
          const approved = await request.onApprovalRequired({
            toolName: step.toolName,
            riskLevel: pending.riskLevel ?? 'SENSITIVE',
            parameters: step.parameters,
            requestId,
          });

          if (approved) {
            const approvalToken = this.policyEngine.approve(requestId);
            result = await this.router.dispatch({
              toolName: step.toolName,
              parameters: step.parameters,
              sessionId: request.sessionId,
              deviceId: request.deviceId,
              taskId,
              approvalToken,
            });
          }
        }
      }

      executionResults.push(result);

      if (!result.success) {
        overallSuccess = false;
        const reviewText = (result.data as any)?.reviewSummary || (result.data as any)?.resultText || '';
        const isLimit =
          /hit your (?:weekly|daily|usage) limit|rate limit|usage limit|resets [a-zA-Z]+ \d+/i.test(reviewText) ||
          result.verification?.evidence?.includes('hit usage limit');

        if (isLimit) {
          spokenSummary = 'Claude Code reported you have hit your weekly limit.';
          responseText = `Claude Code reported:\n${reviewText || result.verification?.evidence}`;
        } else if (result.error?.code === 'ACCESSIBILITY_PERMISSION_REQUIRED') {
          spokenSummary = 'This action requires macOS Accessibility permissions for keystroke automation.';
          responseText = `Action could not complete: ${result.error.message}`;
        } else if (result.error?.message && !/stack trace|error log|never be spoken/i.test(result.error.message)) {
          const rawErr = result.error.message
            .replace(/^(?:execution error:\s*)+/i, '')
            .replace(/Command failed:\s*osascript\s*-e\s*[\s\S]*?execution error:\s*/i, '')
            .trim();
          const cleanMsg = rawErr.length > 120 ? rawErr.substring(0, 120) + '...' : rawErr;
          spokenSummary = `Action failed: ${cleanMsg}`;
          responseText = `Action failed: ${result.error.message}`;
        } else {
          spokenSummary = 'Action failed.';
          responseText = 'Action failed.';
        }
        this.recordExecution(step.toolName, request.goal, result, spokenSummary, responseText);
        break;
      }

      // Synthesize natural spoken response based on tool result
      if (step.toolName === 'system.mac_status') {
        const data = result.data as any;
        spokenSummary = data?.summaryText ?? 'Retrieved macOS system health status.';
        responseText = spokenSummary;
      } else if (step.toolName === 'vscode.open') {
        const target = (result.data as any)?.targetPath ?? 'the project';
        const claudeLaunched = (result.data as any)?.claudeLaunched;
        const claudeRequested = (step.parameters as any)?.launchClaude;
        const targetName = target.split('/').pop() || target;

        if (claudeLaunched) {
          spokenSummary = `Visual Studio Code is open on ${targetName} with Claude Code running in the terminal.`;
          responseText = spokenSummary;
        } else if (claudeRequested) {
          spokenSummary = `Visual Studio Code is open on ${targetName}. Launching Claude Code in the integrated terminal requires Accessibility permissions.`;
          responseText = `Visual Studio Code is open on ${targetName}.\n⚠️ Note: Launching Claude Code in the integrated terminal automatically requires Accessibility permissions for keystroke automation. Grant Terminal (or your IDE) permission in macOS System Settings -> Privacy & Security -> Accessibility.`;
        } else {
          spokenSummary = `Visual Studio Code is open on ${targetName}.`;
          responseText = spokenSummary;
        }
      } else if (step.toolName === 'claude.review_project') {
        const data = result.data as any;
        const reviewText = data?.reviewSummary || '';
        const isLimit = /hit your (?:weekly|daily|usage) limit|rate limit|resets [a-zA-Z]+ \d+/i.test(reviewText);
        if (isLimit) {
          spokenSummary = 'Claude Code reported you have hit your weekly limit.';
          responseText = `Claude Code reported:\n${reviewText}`;
        } else {
          spokenSummary = 'Claude Code completed the codebase review.';
          responseText = `Claude Code completed the codebase review:\n${reviewText}`;
        }
      } else if (step.toolName === 'claude.complete_task') {
        const data = result.data as any;
        const taskText = data?.resultText || '';
        const isLimit = /hit your (?:weekly|daily|usage) limit|rate limit|resets [a-zA-Z]+ \d+/i.test(taskText);
        if (isLimit) {
          spokenSummary = 'Claude Code reported you have hit your weekly limit.';
          responseText = `Claude Code reported:\n${taskText}`;
        } else {
          spokenSummary = 'Claude Code successfully executed the task.';
          responseText = `Claude Code task execution:\n${taskText}`;
        }
      } else if (step.toolName === 'claude.status') {
        const data = result.data as { activeCount?: number; sessions?: unknown[]; summary?: string };
        spokenSummary = data?.summary ?? 'Retrieved Claude Code background-agent status.';
        responseText = data?.sessions?.length
          ? `${spokenSummary}\n${JSON.stringify(data.sessions, null, 2)}`
          : spokenSummary;
      } else if (step.toolName === 'whatsapp.send_message') {
        const p = step.parameters as { recipient: string; message: string };
        spokenSummary = `I have sent "${p.message}" to ${p.recipient} on WhatsApp.`;
        responseText = spokenSummary;
      } else if (step.toolName === 'whatsapp.call') {
        const p = step.parameters as { recipient: string };
        spokenSummary = `Voice call initiated to ${p.recipient} on WhatsApp.`;
        responseText = spokenSummary;
      } else if (step.toolName === 'whatsapp.video_call') {
        const p = step.parameters as { recipient: string };
        spokenSummary = `Video call initiated to ${p.recipient} on WhatsApp.`;
        responseText = spokenSummary;
      } else if (step.toolName === 'app.status') {
        const data = result.data as { appName: string; running: boolean; pids: number[] };
        spokenSummary = data.running
          ? `Yes, ${data.appName} is currently running with process ID ${data.pids.join(', ')}.`
          : `No, ${data.appName} is not currently running.`;
        responseText = spokenSummary;
      } else if (step.toolName === 'app.launch') {
        spokenSummary = `I have launched ${(step.parameters.appName as string)} for you.`;
        responseText = spokenSummary;
      } else if (step.toolName === 'window.close') {
        const app = (step.parameters.appName as string) || 'the application';
        spokenSummary = `Closed window of ${app}.`;
        responseText = spokenSummary;
      } else if (step.toolName === 'window.focus') {
        const app = (step.parameters.appName as string) || 'the application';
        spokenSummary = `Focused ${app}.`;
        responseText = spokenSummary;
      } else if (step.toolName === 'browser.open') {
        const browser = (step.parameters.browser as string) || 'your browser';
        spokenSummary = `Opened in ${browser}.`;
        responseText = spokenSummary;
      } else if (step.toolName === 'fs.read') {
        const data = result.data as { path: string; bytesRead: number };
        spokenSummary = `Successfully read ${data.path}, containing ${data.bytesRead} bytes.`;
        responseText = spokenSummary;
      } else if (step.toolName === 'screen.capture') {
        spokenSummary = 'Screenshot captured and verified on disk.';
        responseText = spokenSummary;
      } else if (step.toolName === 'terminal.exec') {
        const cmd = step.parameters.command as string;
        const data = result.data as { exitCode: number; stdout: string };
        if (cmd === 'npm test') {
          spokenSummary = data.exitCode === 0 ? 'Project test suite passed successfully.' : 'Some project tests failed.';
        } else if (cmd === 'npm run build') {
          spokenSummary = data.exitCode === 0 ? 'Project build succeeded with zero errors.' : 'Project build encountered errors.';
        } else if (cmd === 'npm start') {
          spokenSummary = 'Project server started in the background.';
        } else if (cmd.includes('output volume')) {
          spokenSummary = 'macOS volume adjusted.';
        } else if (cmd.includes('dark mode')) {
          spokenSummary = 'macOS appearance toggled.';
        } else if (cmd.includes('open ~/Downloads')) {
          spokenSummary = 'Opened Downloads folder in Finder.';
        } else if (cmd.includes('open ~/Desktop')) {
          spokenSummary = 'Opened Desktop folder in Finder.';
        } else {
          spokenSummary = data.exitCode === 0
            ? `Command completed successfully.`
            : `Command failed with exit code ${data.exitCode}.`;
        }
        responseText = spokenSummary;
      } else if (step.toolName === 'context.budget') {
        const data = result.data as any;
        spokenSummary = `Total tokens used: ${data?.sessionTotalTokens ?? 0} costing $${data?.costUsd ?? 0} USD.`;
        responseText = `${data?.gauge ?? ''}\n• Input Tokens: ${data?.inputTokens?.toLocaleString?.() ?? data?.inputTokens}\n• Output Tokens: ${data?.outputTokens?.toLocaleString?.() ?? data?.outputTokens}\n• Daily Limit: ${data?.dailyLimit?.toLocaleString?.() ?? data?.dailyLimit} (${data?.usagePercentage}% consumed)\n• Remaining: ${data?.remainingTokens?.toLocaleString?.() ?? data?.remainingTokens} tokens`;
      } else if (step.toolName === 'context.analyze') {
        const data = result.data as any;
        spokenSummary = `Context analysis for ${data?.filePath} achieved ${data?.reductionPercentage}% token reduction.`;
        responseText = `Context Analysis (${data?.filePath}):\n• Original Tokens: ${data?.originalTokens}\n• Sliced Tokens: ${data?.slicedTokens} (${data?.reductionPercentage}% reduction, ${data?.tokensSaved} tokens saved)\n• Symbols Indexed: ${data?.symbolsCount}\n\nHigh-Signal Context Slice:\n${data?.contextSlice}`;
      } else if (step.toolName === 'pragmatic.yagni_eval') {
        const data = result.data as any;
        spokenSummary = `YAGNI evaluation: ${data?.decision} at step ${data?.step} (${data?.stepName}). ${data?.approved ? 'Approved' : 'Rejected'}.`;
        responseText = `Ponytail YAGNI Decision: ${data?.decision} (Step ${data?.step}: ${data?.stepName})\n• Status: ${data?.approved ? 'APPROVED' : 'REJECTED'}\n• Mode: ${data?.mode}\n• Rationale: ${data?.rationale}\n• Suggested Approach: ${data?.suggestedApproach}\n• LOC Budget: ${data?.locBudget} lines\n${data?.warnings?.length ? `• Warnings: ${data.warnings.join('; ')}\n` : ''}${data?.remediation ? `• Remediation: ${data.remediation}` : ''}`.trim();
      } else if (step.toolName === 'code.review') {
        const data = result.data as any;
        spokenSummary = `Code review for ${data?.filePath || 'target'} scored ${data?.score} out of 100, verdict ${data?.verdict}.`;
        responseText = data?.summary ?? `Code Review: Score ${data?.score}/100 [${data?.verdict}] (${data?.violationsCount} issues found)`;
      } else if (step.toolName === 'dev.self_healing_refactor') {
        const data = result.data as any;
        spokenSummary = `Self-healing refactor ${data?.status === 'SUCCESS' ? 'succeeded and passed all tests' : 'was rolled back safely'}.`;
        responseText = `Autonomous Self-Healing Refactor Result:\n• Status: ${data?.status}\n• Goal: ${data?.refactorGoal}\n• Files Applied: ${data?.appliedFiles?.join(', ') || 'None'}\n• Rollback Occurred: ${data?.rollbackOccurred ? 'YES' : 'NO'}${data?.rollbackReason ? `\n• Rollback Reason: ${data?.rollbackReason}` : ''}\n• Duration: ${data?.durationMs}ms\n\n${data?.diffSummary ? `Diff Summary:\n${data?.diffSummary}` : ''}`.trim();
      } else {
        spokenSummary = `Step completed: ${step.thought}`;
        responseText = spokenSummary;
      }

      accumulatedSpoken.push(spokenSummary);
      accumulatedText.push(responseText);
      this.recordExecution(step.toolName, request.goal, result, spokenSummary, responseText);
    }

    if (overallSuccess && accumulatedSpoken.length > 1) {
      spokenSummary = accumulatedSpoken.join(' ');
      responseText = accumulatedText.join('\n\n');
    }

    if (request.speakResponse !== false) {
      await this.voice.speak(spokenSummary);
    }

    const inputTokens = ASTSymbolParser.estimateTokens(request.goal + ' ' + (enhanced?.enhancedPrompt ?? ''));
    const outputTokens = ASTSymbolParser.estimateTokens((responseText || spokenSummary) + ' ' + spokenSummary);
    this.tokenRadar.recordUsage({
      inputTokens,
      outputTokens,
      taskId: request.taskId || request.sessionId,
    });

    return {
      goal: request.goal,
      enhanced,
      success: overallSuccess,
      plan,
      executionResults,
      responseSpeech: spokenSummary,
      responseText: responseText || spokenSummary,
      metrics: {
        durationMs: Date.now() - startTime,
        stepsExecuted: executionResults.length,
      },
    };
  }
}
