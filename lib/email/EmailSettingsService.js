import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getSql } from './db.js';

const SETTINGS_ID = 'default';

function keyFromSecret(secret) {
  return createHash('sha256').update(String(secret)).digest();
}

function encryptSecret(value, secret) {
  if (!value) return null;
  if (!secret) throw new Error('EMAIL_SECRET_KEY is required to store SMTP password');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(b => b.toString('base64')).join('.');
}

function decryptSecret(value, secret) {
  if (!value) return '';
  if (!secret) throw new Error('EMAIL_SECRET_KEY is required to read SMTP password');
  const [ivB64, tagB64, encryptedB64] = String(value).split('.');
  const decipher = createDecipheriv('aes-256-gcm', keyFromSecret(secret), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]).toString('utf8');
}

export class EmailSettingsService {
  constructor(sql = getSql(), env = process.env) {
    this.sql = sql;
    this.env = env;
  }

  envSettings() {
    return {
      provider: this.env.EMAIL_PROVIDER || 'smtp',
      smtp_host: this.env.SMTP_HOST || '',
      smtp_port: this.env.SMTP_PORT || '587',
      smtp_secure: this.env.SMTP_SECURE === 'true',
      smtp_user: this.env.SMTP_USER || '',
      smtp_from: this.env.EMAIL_FROM || this.env.SMTP_FROM || '',
      smtp_password: this.env.SMTP_PASSWORD || '',
      source: 'env',
    };
  }

  async getRow() {
    const rows = await this.sql`
      select *
      from email_settings
      where id = ${SETTINGS_ID}
      limit 1
    `;
    return rows[0] || null;
  }

  async effectiveSettings() {
    const env = this.envSettings();
    const row = await this.getRow().catch(error => {
      if (String(error.message || '').includes('email_settings')) return null;
      throw error;
    });
    if (!row) return env;
    const password = row.smtp_password_encrypted
      ? decryptSecret(row.smtp_password_encrypted, this.env.EMAIL_SECRET_KEY)
      : env.smtp_password;
    return {
      ...env,
      provider: row.provider || env.provider,
      smtp_host: row.smtp_host || env.smtp_host,
      smtp_port: String(row.smtp_port || env.smtp_port || '587'),
      smtp_secure: row.smtp_secure ?? env.smtp_secure,
      smtp_user: row.smtp_user || env.smtp_user,
      smtp_from: row.smtp_from || env.smtp_from,
      smtp_password: password,
      source: 'database',
      updated_at: row.updated_at,
    };
  }

  async publicSettings() {
    const settings = await this.effectiveSettings();
    return {
      provider: settings.provider || 'smtp',
      smtp_host: settings.smtp_host || '',
      smtp_port: settings.smtp_port || '587',
      smtp_secure: Boolean(settings.smtp_secure),
      smtp_user: settings.smtp_user || '',
      smtp_from: settings.smtp_from || '',
      smtp_password_configured: Boolean(settings.smtp_password),
      source: settings.source,
      updated_at: settings.updated_at || null,
    };
  }

  async update(input, actor = 'admin') {
    const current = await this.getRow().catch(error => {
      if (String(error.message || '').includes('email_settings')) return null;
      throw error;
    });
    const encrypted = input.smtp_password
      ? encryptSecret(input.smtp_password, this.env.EMAIL_SECRET_KEY)
      : current?.smtp_password_encrypted || null;
    const rows = await this.sql`
      insert into email_settings (
        id, provider, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_from,
        smtp_password_encrypted, updated_by, updated_at
      )
      values (
        ${SETTINGS_ID}, ${input.provider || 'smtp'}, ${input.smtp_host || ''},
        ${Number(input.smtp_port || 587)}, ${Boolean(input.smtp_secure)},
        ${input.smtp_user || ''}, ${input.smtp_from || ''}, ${encrypted},
        ${actor || 'admin'}, now()
      )
      on conflict (id) do update set
        provider = excluded.provider,
        smtp_host = excluded.smtp_host,
        smtp_port = excluded.smtp_port,
        smtp_secure = excluded.smtp_secure,
        smtp_user = excluded.smtp_user,
        smtp_from = excluded.smtp_from,
        smtp_password_encrypted = excluded.smtp_password_encrypted,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning *
    `;
    return rows[0];
  }
}

