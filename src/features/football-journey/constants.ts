import { type JourneyEntryType } from '@/features/football-journey/types';
import {
  Building2,
  ClipboardCheck,
  Crown,
  Flag,
  GraduationCap,
  HeartPulse,
  MapPin,
  Medal,
  PlayCircle,
  Shield,
  Star,
  Target,
  Trophy,
  UserCheck,
  type LucideIcon,
} from 'lucide-react-native';

export type JourneyTypeMeta = {
  label: string;
  icon: LucideIcon;
  accentClass: string;
};

export const JOURNEY_TYPE_META: Record<JourneyEntryType, JourneyTypeMeta> = {
  academy: { label: 'Academy', icon: GraduationCap, accentClass: 'bg-info-muted' },
  club_transfer: { label: 'Club Transfer', icon: Building2, accentClass: 'bg-background-secondary' },
  achievement: { label: 'Achievement', icon: Medal, accentClass: 'bg-accent-muted' },
  league_title: { label: 'League Title', icon: Crown, accentClass: 'bg-warning-muted' },
  cup_win: { label: 'Cup Win', icon: Trophy, accentClass: 'bg-warning-muted' },
  international_callup: { label: 'International Call-Up', icon: Flag, accentClass: 'bg-info-muted' },
  injury: { label: 'Injury', icon: HeartPulse, accentClass: 'bg-error-muted' },
  recovery: { label: 'Recovery', icon: Shield, accentClass: 'bg-success-muted' },
  trial: { label: 'Trial', icon: ClipboardCheck, accentClass: 'bg-background-secondary' },
  professional_contract: {
    label: 'Professional Contract',
    icon: Star,
    accentClass: 'bg-accent-muted',
  },
  highlight_video: { label: 'Highlight Video', icon: PlayCircle, accentClass: 'bg-info-muted' },
  coach_recommendation: {
    label: 'Coach Recommendation',
    icon: UserCheck,
    accentClass: 'bg-accent-muted',
  },
  gps_session: { label: 'GPS Session', icon: MapPin, accentClass: 'bg-success-muted' },
  statistics_milestone: { label: 'Statistics Milestone', icon: Target, accentClass: 'bg-accent-muted' },
};

export const JOURNEY_TYPE_OPTIONS = Object.entries(JOURNEY_TYPE_META).map(([value, meta]) => ({
  value: value as JourneyEntryType,
  label: meta.label,
}));

export const JOURNEY_FILTER_ALL = 'all' as const;

export type JourneyFilterOption = JourneyEntryType | typeof JOURNEY_FILTER_ALL;
