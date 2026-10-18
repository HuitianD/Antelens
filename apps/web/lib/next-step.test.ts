import assert from 'node:assert/strict';
import test from 'node:test';
import { nextStepCopy, reasoningLines } from './next-step';

const finding = {
  headline: "Page requests you share your sign-in verification code with a 'support representative'",
  consequence: 'Sharing the code gives whoever controls this chat the ability to sign in to your account immediately, locking you out and taking it over.',
};

test('a pause judgment states the saved consequence and the matching observed request', () => {
  const copy = nextStepCopy({
    verdict: 'pause_here',
    finding,
    impacts: ['account_access'],
    checkedScope: [
      'Captured page inspected in Daytona',
      'money: no financial commitment or payment request observed',
      'account_access: page explicitly instructs the visitor to send a six-digit sign-in code to a chat participant',
    ],
  });
  assert.equal(copy.lead, `Pause here before you continue. ${finding.consequence}`);
  assert.deepEqual(copy.reasons, ['Page explicitly instructs the visitor to send a six-digit sign-in code to a chat participant']);
});

test('message-only reasoning keeps the checked scope and one message per limit', () => {
  const lines = reasoningLines({
    checkedScope: ['Message text only — no linked pages, attachments, or external URLs were opened or inspected'],
    limitations: [
      { code: 'no_investigable_link', message: 'The request contains no accessible destination to inspect.' },
      { code: 'no_investigable_link', message: 'The message contains no accessible link or attachment to inspect further.' },
      { code: 'network_policy', message: 'Linked pages were not opened. The isolated browser is unavailable, and the local browser does not open links from real messages.' },
    ],
  });
  assert.deepEqual(lines.checked, ['Message text only — no linked pages, attachments, or external URLs were opened or inspected']);
  assert.deepEqual(lines.limits, [
    'The message contains no accessible link or attachment to inspect further.',
    'Linked pages were not opened. The isolated browser is unavailable, and the local browser does not open links from real messages.',
  ]);
});

test('confirm and clear judgments stay distinct from a pause', () => {
  assert.match(nextStepCopy({ verdict: 'confirm_first', finding, impacts: ['money'], checkedScope: ['money: a $29 monthly membership is required'] }).lead, /^Confirm this before you continue\./);
  assert.equal(nextStepCopy({ verdict: 'no_issues_found', finding: { headline: 'The form matches the request.', consequence: null }, impacts: ['identity'], checkedScope: ['identity: the form asks for the described enrollment letter'] }).lead, 'No issue was found in the checked scope.');
});
