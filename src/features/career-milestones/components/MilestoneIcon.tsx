import {
  Award, BarChart3, BadgeCheck, Clapperboard, Eye, Link2, type LucideIcon, Search, Trophy, Volleyball,
} from 'lucide-react-native';

import { type MilestoneDefinition } from '@/features/career-milestones/types';

const ICONS: Record<string, LucideIcon> = {
  first_match: Volleyball,
  ten_matches: BarChart3,
  first_highlight: Clapperboard,
  passport_live: BadgeCheck,
  username_claimed: Link2,
  discoverable: Search,
  first_endorsement: Award,
  first_scout_view: Eye,
  portfolio_strong: Trophy,
};

/** Drawn icon for a milestone. The catalog's emoji stays as data but is no longer rendered. */
export function MilestoneIcon({ milestone, size = 20, color }: { milestone: Pick<MilestoneDefinition, 'id'>; size?: number; color: string }) {
  const Icon = ICONS[milestone.id] ?? Award;
  return <Icon size={size} color={color} />;
}
