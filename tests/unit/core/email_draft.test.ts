import { describe, expect, it } from 'vitest';
import { EmailDraftCoordinator } from '../../../core/conversation/EmailDraftCoordinator.js';

describe('EmailDraftCoordinator', () => {
  it('normalizes spoken Gmail addresses and requires confirmation before composing', () => {
    const drafts = new EmailDraftCoordinator();
    const start = drafts.handle('open Gmail and mail Aman1067 at the rate gmail dot com');
    expect(start.handled).toBe(true);
    expect(start.response).toContain('aman1067@gmail.com');

    const message = drafts.handle('subject: Project update; message: Hello Aman, the review is complete.');
    expect(message.response).toContain('confirm email');
    expect(message.composeUrl).toBeUndefined();

    const confirmed = drafts.handle('confirm email');
    expect(confirmed.composeUrl).toContain('mail.google.com');
    expect(confirmed.composeUrl).toContain('aman1067%40gmail.com');
  });

  it('can cancel a pending email without producing a compose URL', () => {
    const drafts = new EmailDraftCoordinator();
    drafts.handle('email alex at example dot com');
    const cancelled = drafts.handle('cancel email');
    expect(cancelled.response).toContain('Nothing was sent');
    expect(cancelled.composeUrl).toBeUndefined();
  });
});
