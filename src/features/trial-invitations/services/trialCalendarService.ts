import { Linking, Platform } from 'react-native';
import { formatTrialDate } from '@/features/trial-invitations/models/TrialInvitationModel';
import { type TrialInvitation } from '@/features/trial-invitations/types';

export function buildGoogleCalendarUrl(invitation: TrialInvitation): string {
  const start = new Date(invitation.scheduledDate);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const format = (date: Date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const title = `Trial — ${invitation.playerName} @ ${invitation.club}`;
  const details = [
    `Coach: ${invitation.coach}`,
    `Scout: ${invitation.scoutName}`,
    invitation.notes,
  ]
    .filter(Boolean)
    .join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${format(start)}/${format(end)}`,
    details,
    location: invitation.location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcsContent(invitation: TrialInvitation): string {
  const start = new Date(invitation.scheduledDate);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const formatIcs = (date: Date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `${invitation.id}@scoutx.app`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScoutX//Trial Invitation//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatIcs(start)}`,
    `DTEND:${formatIcs(end)}`,
    `SUMMARY:Trial - ${invitation.playerName} @ ${invitation.club}`,
    `LOCATION:${invitation.location}`,
    `DESCRIPTION:Coach ${invitation.coach}. ${invitation.notes}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export async function openTrialInCalendar(invitation: TrialInvitation): Promise<void> {
  const url = buildGoogleCalendarUrl(invitation);
  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    throw new Error('Calendar linking is not supported on this device.');
  }
  await Linking.openURL(url);
}

export function getCalendarActionLabel(): string {
  return Platform.OS === 'web' ? 'Add to Google Calendar' : 'Add to Calendar';
}

export function getTrialCalendarSummary(invitation: TrialInvitation): string {
  return `${formatTrialDate(invitation.scheduledDate)} · ${invitation.location}`;
}
