import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, validateEmailAddress, assertSafeEmailList } from '../lib/email/utils.js';
import { EmailQueueWorker } from '../lib/email/EmailQueueWorker.js';
import { NotificationPreferenceService } from '../lib/email/NotificationPreferenceService.js';

test('template variable replacement', () => {
  const out = renderTemplate('Hello {{user_name}}, task {{task_name}} is {{status}}', {
    user_name: 'Nok',
    task_name: 'BOQ',
    status: 'Doing',
  });
  assert.equal(out, 'Hello Nok, task BOQ is Doing');
});

test('email validation rejects invalid and injection values', () => {
  assert.equal(validateEmailAddress('bd@example.com'), true);
  assert.equal(validateEmailAddress('bad-email'), false);
  assert.throws(() => assertSafeEmailList('a@example.com\nbcc:x@example.com'));
});

test('queue creation stores a pending item', async () => {
  const fakeSql = async () => [{
    id: 'queue-1',
    status: 'pending',
    to_emails: ['bd@example.com'],
    subject: 'Hello',
  }];
  const worker = new EmailQueueWorker(fakeSql, {}, {});
  const item = await worker.enqueue({ to: ['bd@example.com'], subject: 'Hello', html_body: '<p>Hi</p>', text_body: 'Hi' });
  assert.equal(item.status, 'pending');
  assert.equal(item.id, 'queue-1');
});

test('retry logic marks failed message as retry before max retry', async () => {
  const updates = [];
  const logs = [];
  const worker = new EmailQueueWorker(
    async () => [],
    { send: async () => { throw new Error('SMTP down'); } },
    { create: async row => logs.push(row) }
  );
  worker.updateStatus = async (id, status, fields = {}) => {
    updates.push({ id, status, fields });
    return { id, status, ...fields };
  };
  const result = await worker.processOne({
    id: 'q1',
    to_emails: ['bd@example.com'],
    cc_emails: [],
    bcc_emails: [],
    subject: 'Test',
    html_body: '<p>Test</p>',
    text_body: 'Test',
    retry_count: 0,
    max_retry: 3,
  });
  assert.equal(result.status, 'retry');
  assert.equal(updates.at(-1).fields.retry_count, 1);
  assert.equal(logs[0].status, 'retry');
});

test('failed email logging after max retry', async () => {
  const logs = [];
  const worker = new EmailQueueWorker(
    async () => [],
    { send: async () => { throw new Error('Rejected'); } },
    { create: async row => logs.push(row) }
  );
  worker.updateStatus = async (id, status, fields = {}) => ({ id, status, ...fields });
  const result = await worker.processOne({
    id: 'q2',
    to_emails: ['bd@example.com'],
    cc_emails: [],
    bcc_emails: [],
    subject: 'Test',
    html_body: '<p>Test</p>',
    text_body: 'Test',
    retry_count: 2,
    max_retry: 3,
  });
  assert.equal(result.status, 'failed');
  assert.equal(logs[0].error_message, 'Rejected');
});

test('notification preference filtering', () => {
  const service = new NotificationPreferenceService(async () => []);
  assert.equal(service.allows({ daily_summary: false }, 'daily_summary'), false);
  assert.equal(service.allows({ daily_summary: true }, 'daily_summary'), true);
  assert.equal(service.allows(null, 'overdue_alert'), true);
});
