import nodemailer from 'nodemailer';
import { assertSafeEmailList, assertSafeHeader } from './utils.js';
import { EmailSettingsService } from './EmailSettingsService.js';

export class EmailService {
  constructor(config = process.env, settingsService = null) {
    this.config = config;
    this.settingsService = settingsService || new EmailSettingsService(undefined, config);
  }

  async getEffectiveConfig() {
    try {
      return await this.settingsService.effectiveSettings();
    } catch (error) {
      console.warn('Email settings load failed, using environment variables', error);
      return {
        SMTP_HOST: this.config.SMTP_HOST,
        SMTP_PORT: this.config.SMTP_PORT,
        SMTP_SECURE: this.config.SMTP_SECURE,
        SMTP_USER: this.config.SMTP_USER,
        SMTP_PASSWORD: this.config.SMTP_PASSWORD,
        EMAIL_FROM: this.config.EMAIL_FROM || this.config.SMTP_FROM,
      };
    }
  }

  async getTransport(config) {
    if (!config.smtp_host && !config.SMTP_HOST) {
      return nodemailer.createTransport({ jsonTransport: true });
    }

    return nodemailer.createTransport({
      host: config.smtp_host || config.SMTP_HOST,
      port: Number(config.smtp_port || config.SMTP_PORT || 587),
      secure: config.smtp_secure ?? (String(config.SMTP_SECURE || 'false') === 'true'),
      auth: (config.smtp_user || config.SMTP_USER)
        ? { user: config.smtp_user || config.SMTP_USER, pass: config.smtp_password || config.SMTP_PASSWORD }
        : undefined,
    });
  }

  sanitizeMessage(message, config = this.config) {
    const to = assertSafeEmailList(message.to, 'to');
    const cc = assertSafeEmailList(message.cc, 'cc');
    const bcc = assertSafeEmailList(message.bcc, 'bcc');
    const replyTo = message.reply_to ? assertSafeEmailList(message.reply_to, 'reply-to')[0] : undefined;
    const subject = assertSafeHeader(message.subject, 'subject');

    if (!to.length && !cc.length && !bcc.length) {
      throw new Error('At least one recipient is required');
    }

    return {
      from: config.smtp_from || config.EMAIL_FROM || config.SMTP_FROM || 'PIRAMID BD <no-reply@bdmgmt.local>',
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
    const config = await this.getEffectiveConfig();
    const payload = this.sanitizeMessage(message, config);
    const info = await (await this.getTransport(config)).sendMail(payload);
    return {
      messageId: info.messageId,
      accepted: info.accepted || payload.to,
      rejected: info.rejected || [],
      response: info.response || info.message || null,
    };
  }
}
