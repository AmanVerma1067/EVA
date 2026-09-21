/** Safe conversational email drafting. EVA prepares mail but never silently sends it. */
export interface EmailDraft {
  recipientName: string;
  recipientEmail: string;
  subject: string;
  body: string;
}

export type EmailDraftResult =
  | { handled: false }
  | { handled: true; response: string; draft?: EmailDraft; composeUrl?: string };

function normalizeSpokenEmail(input: string): string | undefined {
  const normalized = input
    .toLowerCase()
    .replace(/\b(?:email|mail|send|open|kindly|please)\b/g, ' ')
    .replace(/\bat the rate\b|\bat rate\b|\bat\b/g, '@')
    .replace(/\bdot\b/g, '.')
    .replace(/\s+/g, '');
  const match = normalized.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0];
}

export class EmailDraftCoordinator {
  private draft?: Partial<EmailDraft>;
  private phase: 'message' | 'confirmation' = 'message';

  public handle(input: string): EmailDraftResult {
    const text = input.trim();
    if (/^(?:cancel|cancel email|never mind)$/i.test(text) && this.draft) {
      this.draft = undefined;
      return { handled: true, response: 'Email draft cancelled. Nothing was sent.' };
    }

    if (this.draft) return this.continueDraft(text);

    if (!/\b(?:email|mail)\b/i.test(text)) return { handled: false };
    const recipientEmail = normalizeSpokenEmail(text);
    if (!recipientEmail) {
      return { handled: true, response: 'What email address should I use? Please say or type it, for example: alex at example dot com.' };
    }
    const localPart = recipientEmail.split('@')[0];
    const recipientName = localPart.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    this.draft = { recipientName, recipientEmail };
    this.phase = 'message';
    return { handled: true, response: `I heard ${recipientName} at ${recipientEmail}. What message should I put in the email?` };
  }

  private continueDraft(input: string): EmailDraftResult {
    if (!this.draft?.recipientEmail || !this.draft.recipientName) return { handled: false };
    if (this.phase === 'message') {
      const subjectMatch = input.match(/subject\s*:\s*([^;]+)(?:;|$)/i);
      const bodyMatch = input.match(/(?:message|body)\s*:\s*(.+)$/i);
      const body = (bodyMatch?.[1] ?? input).trim();
      if (!body) return { handled: true, response: 'Please tell me the message you want to send, or say cancel email.' };
      this.draft.subject = subjectMatch?.[1].trim() ?? 'Message from Aman';
      this.draft.body = body;
      this.phase = 'confirmation';
      return {
        handled: true,
        draft: this.draft as EmailDraft,
        response: `Please confirm this draft: To ${this.draft.recipientName} at ${this.draft.recipientEmail}. Subject: ${this.draft.subject}. Message: ${this.draft.body}. Say "confirm email" to open it in Gmail, or "cancel email".`,
      };
    }

    if (!/^confirm(?: email)?$/i.test(input)) {
      return { handled: true, response: 'Email is still waiting for confirmation. Say "confirm email" to open the draft in Gmail, or "cancel email".' };
    }
    const draft = this.draft as EmailDraft;
    this.draft = undefined;
    const composeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(draft.recipientEmail)}&su=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
    return {
      handled: true,
      draft,
      composeUrl,
      response: `Confirmed. I will open a prefilled Gmail draft for ${draft.recipientName}. Review it and click Send in Gmail yourself.`,
    };
  }
}
