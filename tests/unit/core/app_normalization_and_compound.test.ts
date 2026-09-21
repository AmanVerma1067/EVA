import { describe, it, expect, vi } from 'vitest';
import { PromptEnhancer } from '../../../core/planner/PromptEnhancer.js';
import { AgentBrain } from '../../../core/planner/AgentBrain.js';
import { ToolRouter } from '../../../core/tools/ToolRouter.js';
import { normalizeMacAppName } from '../../../tools/application/AppLaunchTool.js';

describe('App Normalization, YouTube & Developer Project Commands', () => {
  const enhancer = new PromptEnhancer();
  const mockRouter = {
    dispatch: vi.fn(),
  } as unknown as ToolRouter;
  const brain = new AgentBrain({ router: mockRouter, promptEnhancer: enhancer });

  describe('macOS Application Normalization', () => {
    it('should normalize common app aliases and strip noise prefixes', () => {
      expect(normalizeMacAppName('chrome')).toBe('Google Chrome');
      expect(normalizeMacAppName('google chrome')).toBe('Google Chrome');
      expect(normalizeMacAppName('Application chrome.')).toBe('Google Chrome');
      expect(normalizeMacAppName('app calculator!')).toBe('Calculator');
      expect(normalizeMacAppName('calc')).toBe('Calculator');
      expect(normalizeMacAppName('code')).toBe('Visual Studio Code');
      expect(normalizeMacAppName('vscode')).toBe('Visual Studio Code');
      expect(normalizeMacAppName('vs code')).toBe('Visual Studio Code');
      expect(normalizeMacAppName('whatsapp')).toBe('WhatsApp');
      expect(normalizeMacAppName('safari')).toBe('Safari');
    });

    it('should parse app launch goals with clean app names', () => {
      const planChrome = brain.parseGoalToPlan('open chrome');
      expect(planChrome).toHaveLength(1);
      expect(planChrome[0].toolName).toBe('app.launch');
      expect(planChrome[0].parameters.appName).toBe('Google Chrome');

      const planCalc = brain.parseGoalToPlan('open calculator');
      expect(planCalc).toHaveLength(1);
      expect(planCalc[0].toolName).toBe('app.launch');
      expect(planCalc[0].parameters.appName).toBe('Calculator');
    });

    it('should enhance app launch prompts accurately without prefix bugs', () => {
      const enhanced = enhancer.enhance('open chrome');
      expect(enhanced.enhancedPrompt).toBe('Launch Google Chrome.');
      expect(enhanced.entities.appName).toBe('Google Chrome');
      expect(enhanced.intentCategory).toBe('APP_CONTROL');
    });
  });

  describe('YouTube & Web Media Playback', () => {
    it('should enhance compound YouTube playback queries', () => {
      const enhanced = enhancer.enhance('open chrome and play a song on YouTube');
      expect(enhanced.intentCategory).toBe('BROWSER');
      expect(enhanced.enhancedPrompt).toContain('YouTube');
      expect(enhanced.entities.taskDescription).toBeDefined();
    });

    it('should plan browser opening for YouTube playback', () => {
      const plan = brain.parseGoalToPlan('Open YouTube and play a song.');
      expect(plan).toHaveLength(1);
      expect(plan[0].toolName).toBe('browser.open');
      expect(String(plan[0].parameters.url)).toContain('youtube.com');
    });
  });

  describe('Developer Project Commands', () => {
    it('should parse project test commands', () => {
      const plan = brain.parseGoalToPlan('run tests');
      expect(plan).toHaveLength(1);
      expect(plan[0].toolName).toBe('terminal.exec');
      expect(plan[0].parameters.command).toBe('npm test');
    });

    it('should parse project build commands', () => {
      const plan = brain.parseGoalToPlan('build project');
      expect(plan).toHaveLength(1);
      expect(plan[0].toolName).toBe('terminal.exec');
      expect(plan[0].parameters.command).toBe('npm run build');
    });

    it('should parse project start server commands', () => {
      const plan = brain.parseGoalToPlan('start server');
      expect(plan).toHaveLength(1);
      expect(plan[0].toolName).toBe('terminal.exec');
      expect(plan[0].parameters.command).toBe('npm start');
    });
  });

  describe('Mac System Controls', () => {
    it('should plan volume control via osascript', () => {
      const plan = brain.parseGoalToPlan('volume up');
      expect(plan).toHaveLength(1);
      expect(plan[0].toolName).toBe('terminal.exec');
      expect(String(plan[0].parameters.command)).toContain('set volume output volume');
    });

    it('should plan dark mode toggling', () => {
      const plan = brain.parseGoalToPlan('toggle dark mode');
      expect(plan).toHaveLength(1);
      expect(plan[0].toolName).toBe('terminal.exec');
      expect(String(plan[0].parameters.command)).toContain('appearance preferences');
    });

    it('should plan lock screen', () => {
      const plan = brain.parseGoalToPlan('lock screen');
      expect(plan).toHaveLength(1);
      expect(plan[0].toolName).toBe('terminal.exec');
      expect(String(plan[0].parameters.command)).toContain('keystroke "q"');
    });
  });

  describe('General "open <target> in <app>" Navigation (Zero Hardcoding)', () => {
    it('should enhance and plan "Open fire base in chrome" as browser search without hardcoding', () => {
      const enhanced = enhancer.enhance('Open fire base in chrome');
      expect(enhanced.intentCategory).toBe('BROWSER');
      expect(enhanced.entities.appName).toBe('Google Chrome');
      expect(enhanced.enhancedPrompt).toContain('Google Chrome');

      const plan = brain.parseGoalToPlan('Open fire base in chrome');
      expect(plan).toHaveLength(2);
      expect(plan[0].toolName).toBe('app.launch');
      expect(plan[0].parameters.appName).toBe('Google Chrome');
      expect(plan[1].toolName).toBe('browser.open');
      expect(String(plan[1].parameters.url)).toContain('google.com/search?q=fire%20base');
      expect(plan[1].parameters.browser).toBe('Google Chrome');
    });

    it('should enhance and plan "Open google.com in safari" directly to URL in Safari', () => {
      const plan = brain.parseGoalToPlan('open google.com in safari');
      expect(plan).toHaveLength(2);
      expect(plan[0].toolName).toBe('app.launch');
      expect(plan[0].parameters.appName).toBe('Safari');
      expect(plan[1].toolName).toBe('browser.open');
      expect(plan[1].parameters.url).toBe('https://google.com');
      expect(plan[1].parameters.browser).toBe('Safari');
    });

    it('should truncate failure spoken summary to avoid droning on', async () => {
      mockRouter.dispatch = vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'TEST_FAIL', message: 'Command failed with massive stack trace and error logs that should never be spoken' },
      });

      const res = await brain.executeGoal({
        goal: 'open calculator',
        sessionId: 'sess',
        deviceId: 'dev',
        speakResponse: false,
      });

      expect(res.success).toBe(false);
      expect(res.responseSpeech).toBe('Action failed.');
      expect(res.responseText).toBe('Action failed.');
    });
  });
});

