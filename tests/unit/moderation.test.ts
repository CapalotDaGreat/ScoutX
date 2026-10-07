import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  REPORT_REASONS as SERVER_REASONS,
  REPORT_TARGET_TYPES as SERVER_TARGETS,
  actionAllowedForTarget,
  canAppeal,
  caseStateAfter,
  comparePriority,
  higherPriority,
  holdStateFor,
  isDestructive,
  isRecentAuth,
  priorityFor,
  roleMayApply,
  shouldAutoRestrict,
  validReason,
} from '../../functions/src/moderation/model.ts';
import {
  REPORT_REASONS as CLIENT_REASONS,
  REPORT_TARGET_TYPES as CLIENT_TARGETS,
  reportReasonsFor,
} from '../../src/features/trust-safety/constants.ts';
import { parseModerationNotice } from '../../src/features/trust-safety/moderationNotice.ts';
import { canLeavePrivate, parseModerationState, parseRightsState } from '../../src/features/media-library/types.ts';
import { highlightVideoToMediaItem } from '../../src/features/media-library/services/mediaMigration.ts';
import type { HighlightVideo } from '../../src/features/highlight-videos/types.ts';

describe('report vocabulary', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

  it('client, server and rules accept the same reasons and targets', () => {
    assert.deepEqual(CLIENT_REASONS.map((reason) => reason.value), [...SERVER_REASONS]);
    assert.deepEqual([...CLIENT_TARGETS], [...SERVER_TARGETS]);
    for (const reason of SERVER_REASONS) assert.ok(rules.includes(`'${reason}'`), `rules reason ${reason}`);
    for (const target of SERVER_TARGETS) assert.ok(rules.includes(`'${target}'`), `rules target ${target}`);
  });

  it('offers "I appear in this video" on every video target', () => {
    for (const target of ['media', 'reel', 'passport'] as const) {
      assert.ok(reportReasonsFor(target).includes('appears_in_video'));
      assert.ok(reportReasonsFor(target).includes('minor_in_video'));
    }
    assert.ok(reportReasonsFor('trial').includes('inappropriate_contact'));
  });
});

describe('moderation model', () => {
  it('reviews minors, contact and exploitation first', () => {
    assert.equal(priorityFor('minor_in_video', false), 'urgent');
    assert.equal(priorityFor('exploitation', false), 'urgent');
    assert.equal(priorityFor('appears_in_video', false), 'high');
    assert.equal(priorityFor('spam', true), 'high');
    assert.equal(priorityFor('spam', false), 'normal');
    assert.equal(higherPriority('normal', 'urgent'), 'urgent');
    assert.ok(comparePriority('urgent', 'normal') < 0);
  });

  it('auto-restricts videos reported by people who appear in them', () => {
    assert.equal(shouldAutoRestrict('media', 'appears_in_video'), true);
    assert.equal(shouldAutoRestrict('reel', 'minor_in_video'), true);
    assert.equal(shouldAutoRestrict('media', 'spam'), false);
    assert.equal(shouldAutoRestrict('post', 'privacy'), false);
  });

  it('limits account actions to accounts and destructive actions to admins', () => {
    assert.equal(actionAllowedForTarget('suspend', 'user'), true);
    assert.equal(actionAllowedForTarget('suspend', 'media'), false);
    assert.equal(roleMayApply('moderator', 'restrict'), true);
    assert.equal(roleMayApply('moderator', 'remove'), false);
    assert.equal(roleMayApply('admin', 'disable'), true);
    assert.equal(isDestructive('remove'), true);
    assert.equal(isDestructive('warn'), false);
  });

  it('requires a recent sign-in for destructive actions', () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    assert.equal(isRecentAuth(now / 1000 - 60, now), true);
    assert.equal(isRecentAuth(now / 1000 - 16 * 60, now), false);
    assert.equal(isRecentAuth(undefined, now), false);
  });

  it('moves cases through the state machine and allows one appeal', () => {
    assert.equal(caseStateAfter('dismiss'), 'closed');
    assert.equal(caseStateAfter('escalate'), 'review');
    assert.equal(caseStateAfter('remove'), 'notified');
    assert.equal(holdStateFor('restrict'), 'restricted');
    assert.equal(holdStateFor('warn'), null);
    assert.equal(canAppeal('notified', 'remove', false), true);
    assert.equal(canAppeal('notified', 'remove', true), false);
    assert.equal(canAppeal('notified', 'dismiss', false), false);
    assert.equal(canAppeal('closed', 'remove', false), false);
  });

  it('requires a staff reason', () => {
    assert.equal(validReason('ok'), false);
    assert.equal(validReason('Contains a minor without consent'), true);
  });
});

describe('moderation notices', () => {
  it('parses server notices and hides the appeal once one is pending', () => {
    const notice = parseModerationNotice('c1', {
      action: 'remove',
      reasonCode: 'appears_in_video',
      appealable: true,
      at: '2026-10-07T10:00:00.000Z',
    });
    assert.equal(notice?.appealable, true);
    assert.equal(notice?.caseId, 'c1');
    const pending = parseModerationNotice('c1', { action: 'remove', appealable: true, appealStatus: 'pending', at: 'x' });
    assert.equal(pending?.appealable, false);
    assert.equal(parseModerationNotice('c2', { action: 'delete_everything', at: 'x' }), null);
    assert.equal(parseModerationNotice('c3', { action: 'restored', at: 'x' })?.action, 'restored');
  });
});

describe('media rights', () => {
  it('migrated legacy highlights start private and unconfirmed', () => {
    const video = {
      id: 'v1',
      title: 'Goal',
      storagePath: 'profiles/p1/videos/v1/video.mp4',
      featured: true,
      uploadStatus: 'ready',
      durationSec: 12,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as HighlightVideo;
    const item = highlightVideoToMediaItem(video, 'p1');
    assert.equal(item.visibility, 'private');
    assert.equal(item.rightsState, 'unconfirmed');
    assert.equal(item.moderationState, 'none');
  });

  it('only confirmed, unmoderated media may leave private', () => {
    assert.equal(canLeavePrivate({ rightsState: 'user_confirmed', moderationState: 'none' }), true);
    assert.equal(canLeavePrivate({ rightsState: 'unconfirmed', moderationState: 'none' }), false);
    assert.equal(canLeavePrivate({ rightsState: 'user_confirmed', moderationState: 'restricted' }), false);
    assert.equal(parseRightsState('anything'), 'unconfirmed');
    assert.equal(parseModerationState(undefined), 'none');
  });
});
