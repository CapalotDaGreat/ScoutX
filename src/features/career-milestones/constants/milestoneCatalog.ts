import { type MilestoneDefinition } from '@/features/career-milestones/types';

export const MILESTONE_CATALOG: MilestoneDefinition[] = [
  {
    id: 'first_match',
    title: 'First Match Logged',
    description: 'You started tracking real match performance.',
    category: 'performance',
    icon: '⚽',
  },
  {
    id: 'ten_matches',
    title: '10 Matches Logged',
    description: 'A consistent performance history is building.',
    category: 'performance',
    icon: '📊',
  },
  {
    id: 'first_highlight',
    title: 'First Highlight Video',
    description: 'Scouts can now see your best moments.',
    category: 'portfolio',
    icon: '🎬',
  },
  {
    id: 'passport_live',
    title: 'Football Passport Live',
    description: 'Your public portfolio is shareable worldwide.',
    category: 'portfolio',
    icon: '🛂',
  },
  {
    id: 'username_claimed',
    title: 'Custom Link Claimed',
    description: 'Your scoutx.app link-in-bio is ready to share.',
    category: 'portfolio',
    icon: '🔗',
  },
  {
    id: 'discoverable',
    title: 'Scout Discovery Enabled',
    description: 'Opted in to appear in scout search.',
    category: 'portfolio',
    icon: '🔍',
  },
  {
    id: 'first_endorsement',
    title: 'First Coach Endorsement',
    description: 'Trusted voice added to your Football Passport.',
    category: 'trust',
    icon: '🏅',
  },
  {
    id: 'first_scout_view',
    title: 'First Scout View',
    description: 'A scout opened your Football Passport.',
    category: 'trust',
    icon: '👀',
  },
  {
    id: 'portfolio_strong',
    title: 'Portfolio Strength 80+',
    description: 'Your Football Passport is professionally complete.',
    category: 'portfolio',
    icon: '💪',
  },
];

export function getMilestoneDefinition(id: string): MilestoneDefinition | undefined {
  return MILESTONE_CATALOG.find((item) => item.id === id);
}
