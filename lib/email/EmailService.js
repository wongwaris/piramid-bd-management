import nodemailer from 'nodemailer';
import { assertSafeEmailList, assertSafeHeader } from './utils.js';

export class EmailService {
  constructor(config = process.env) {
    this.config = config;
  }

  getTransport() {
    if (!this.config.SMTP_HOST) {
      return nodemailer.createTransport({ jsonTransport: true });
    }

    return nodemailer.createTransport({
      host: this.config.SMTP_HOST,
      port: Number(this.config.SMTP_PORT || 587),
      secure: String(this.config.SMTP_SECURE || 'false') === 'true',
      auth: this.config.SMTP_USER
        ? { user: this.config.SMTP_USER, pass: this.config.SMTP_PASSWORD }
        : undefined,
    });
  }

  sanitizeMessage(message) {
    const to = assertSafeEmailList(message.to, 'to');
    const cc = assertSafeEmailList(message.cc, 'cc');
    const bcc = assertSafeEmailList(message.bcc, 'bcc');
    const replyTo = message.reply_to ? assertSafeEmailList(message.reply_to, 'reply-to')[0] : undefined;
    const subject = assertSafeHeader(message.subject, 'subject');

    if (!to.length && !cc.length && !bcc.length) {
      throw new Error('At least one recipient is required');
    }

    return {
      from: this.config.EMAIL_FROM || this.config.SMTP_FROM || 'PIRAMID BD <no-reply@bdmgmt.local>',
      to,
      cc,
      bcc,
      replyTo,
      subject,
      html: message.html_body,
      text: message.text_body,
      attachments: message.attachments || [],
    };
  }

  async send(message) {
    const payload = this.sanitizeMessage(message);
    const info = await this.getTransport().sendMail(payload);
    return {
      messageId: info.messageId,
      accepted: info.accepted || payload.to,
      rejected: info.rejected || [],
      response: info.response || info.message || null,
    };
  }
}
