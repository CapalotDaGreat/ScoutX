import { buildActivityFromDraft } from '@/features/activity-feed/models/ActivityModel';
import { type ActivityItem } from '@/features/activity-feed/types';

const now = Date.now();

export function getMockActivities(recipientId: string, role: 'player' | 'scout'): ActivityItem[] {
  if (role === 'scout') {
    return [
      buildActivityFromDraft({
        id: 'mock-scout-1',
        recipientId,
        recipientRole: 'scout',
        type: 'player_saved',
        category: 'recruitment',
        title: 'Player Saved',
        body: 'Mateo Alvarez was added to your recruitment pipeline.',
        actorId: recipientId,
        actorName: 'You',
        actorRole: 'scout',
        read: false,
        createdAt: new Date(now - 1000 * 60 * 20).toISOString(),
      }),
      buildActivityFromDraft({
        id: 'mock-scout-2',
        recipientId,
        recipientRole: 'scout',
        type: 'scouting_report_created',
        category: 'scouting',
        title: 'New Scouting Report',
        body: 'You published a scouting report on Jonas Müller.',
        actorId: recipientId,
        actorName: 'You',
        actorRole: 'scout',
        read: true,
        createdAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
      }),
    ];
  }

  return [
    buildActivityFromDraft({
      id: 'mock-player-1',
      recipientId,
      recipientRole: 'player',
      type: 'trial_invitation',
      category: 'trial',
      title: 'Trial Invitation',
      body: 'Coach Ruiz invited you to a trial at Northstar FC.',
      actorId: 'scout-demo',
      actorName: 'Coach Ruiz',
      actorRole: 'scout',
      read: false,
      createdAt: new Date(now - 1000 * 60 * 45).toISOString(),
    }),
    buildActivityFromDraft({
      id: 'mock-player-2',
      recipientId,
      recipientRole: 'player',
      type: 'recommendation_received',
      category: 'trust',
      title: 'Recommendation Received',
      body: 'Scout Weber endorsed you: Elite vision in final third.',
      actorId: 'scout-weber',
      actorName: 'Scout Weber',
      actorRole: 'scout',
      read: false,
      createdAt: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
    }),
    buildActivityFromDraft({
      id: 'mock-player-3',
      recipientId,
      recipientRole: 'player',
      type: 'profile_updated',
      category: 'profile',
      title: 'Profile Updated',
      body: 'You updated your football profile.',
      actorId: recipientId,
      actorName: 'You',
      actorRole: 'player',
      read: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 26).toISOString(),
    }),
  ];
}
