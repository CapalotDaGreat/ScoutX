import { useState } from 'react';
import { View } from 'react-native';
import { ClipboardList } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { ScoutingReportCard } from '@/features/scouting-reports/components/ScoutingReportCard';
import { ScoutingReportEditorModal } from '@/features/scouting-reports/components/ScoutingReportEditorModal';
import { useScoutingReports } from '@/features/scouting-reports/hooks/useScoutingReports';
import { type ScoutingReport } from '@/features/scouting-reports/types';
import { Section } from '@/components/layout/Section';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type ScoutingReportsSectionProps = {
  playerId: string;
  playerName: string;
};

export function ScoutingReportsSection({ playerId, playerName }: ScoutingReportsSectionProps) {
  const { t } = useAppTranslation(['scout']);
  const { colors } = useTheme();
  const { reports, isLoading, isSaving, saveReport, deleteReport } = useScoutingReports(
    playerId,
    playerName,
  );
  const [editorVisible, setEditorVisible] = useState(false);
  const [activeReport, setActiveReport] = useState<ScoutingReport | null>(null);

  const openCreate = () => {
    setActiveReport(null);
    setEditorVisible(true);
  };

  const openEdit = (report: ScoutingReport) => {
    setActiveReport(report);
    setEditorVisible(true);
  };

  return (
    <>
      <Section
        title={t('reports.sectionTitle')}
        subtitle={t('reports.sectionSubtitle')}
        action={
          <Button variant="accent" size="sm" onPress={openCreate}>
            {t('reports.newReport')}
          </Button>
        }
      >
        <View className="mb-3 flex-row items-center gap-2 rounded-lg bg-accent-muted/40 px-3 py-2">
          <ClipboardList size={16} color={colors.accent} />
          <Text variant="caption" color="accent" className="flex-1">
            {t('reports.count', { count: reports.length })}
          </Text>
        </View>

        {isLoading ? (
          <SkeletonLoader variant="card" count={2} />
        ) : reports.length === 0 ? (
          <View className="rounded-xl border border-dashed border-border px-4 py-8">
            <Text variant="body-sm" color="secondary" className="text-center">
              {t('reports.sectionEmpty', { playerName })}
            </Text>
            <Button variant="accent" className="mt-4" onPress={openCreate}>
              {t('reports.createReport')}
            </Button>
          </View>
        ) : (
          <View className="gap-3">
            {reports.map((report, index) => (
              <ScoutingReportCard
                key={report.id}
                report={report}
                index={index}
                onPress={openEdit}
              />
            ))}
          </View>
        )}
      </Section>

      <ScoutingReportEditorModal
        visible={editorVisible}
        playerName={playerName}
        report={activeReport}
        saving={isSaving}
        onClose={() => {
          setEditorVisible(false);
          setActiveReport(null);
        }}
        onSave={async (draft) => {
          await saveReport(draft, activeReport ?? undefined);
        }}
        onDelete={activeReport ? deleteReport : undefined}
      />
    </>
  );
}
