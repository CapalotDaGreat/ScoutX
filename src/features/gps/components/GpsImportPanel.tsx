import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { FileUp } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { Section } from '@/components/layout/Section';
import { GpsLiveMetrics } from '@/features/gps/components/GpsLiveMetrics';
import { GpsHeatmap } from '@/features/gps/components/GpsHeatmap';
import { confirmGpsImport, previewGpsImport, type GpsImportPreview } from '@/features/gps/services/gpsImportService';
import { clearLocalGpsImport, loadLocalGpsImport, saveLocalGpsImport } from '@/features/gps/services/gpsImportStorage';
import { createGpsImportOperationGuard, readGpsImportAsset } from '@/features/gps/services/gpsImportInteraction';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export function GpsImportPanel({ playerId, disabled }: { playerId: string | null; disabled: boolean }) {
  const { t } = useAppTranslation(['gps']);
  const [preview, setPreview] = useState<GpsImportPreview | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<GpsImportPreview | null>(null);
  const guard = useRef(createGpsImportOperationGuard()).current;
  const mounted = useRef(false);
  guard.update({ ownerId: playerId, disabled });
  useEffect(() => {
    mounted.current = true;
    const stamp = guard.capture();
    setPreview(null); setLabel(''); setMessage(null); setSaved(null);
    if (playerId) {
      void loadLocalGpsImport(playerId).then((summary) => {
        if (guard.isCurrent(stamp)) setSaved(summary);
      }).catch(() => { if (guard.isCurrent(stamp)) setMessage(t('gps:import.invalid')); });
    }
    return () => { mounted.current = false; guard.invalidate(); };
  }, [playerId, disabled, t, guard]);

  const finish = (stamp: NonNullable<ReturnType<typeof guard.begin>>) => {
    if (guard.finish(stamp) && mounted.current) setBusy(false);
  };

  const pick = async () => {
    if (!playerId) return;
    const stamp = guard.begin(playerId);
    if (!stamp) return;
    const selectedOwner = playerId;
    setBusy(true); setMessage(null); setPreview(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: false, base64: false });
      if (!guard.isCurrent(stamp) || result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('invalid');
      const { content, extension } = await readGpsImportAsset(asset, Platform.OS, (uri) => new File(uri));
      if (!guard.isCurrent(stamp)) return;
      setPreview(previewGpsImport(content, extension, selectedOwner));
    } catch (error) {
      if (!guard.isCurrent(stamp)) return;
      const code = error instanceof Error ? error.message : '';
      setMessage(t(code === 'unsupported' ? 'gps:import.unsupported' : code === 'tooLarge' ? 'gps:import.tooLarge' : 'gps:import.invalid'));
    } finally { finish(stamp); }
  };
  const confirm = async () => {
    if (!playerId || !preview || disabled) return;
    const stamp = guard.begin(playerId);
    if (!stamp) return;
    setBusy(true);
    try {
      const confirmed = await saveLocalGpsImport(playerId, confirmGpsImport(preview, playerId, label));
      if (guard.isCurrent(stamp)) { setSaved(confirmed); setPreview(null); setMessage(t('gps:import.saved')); }
    } catch { if (guard.isCurrent(stamp)) setMessage(t('gps:import.invalid')); }
    finally { finish(stamp); }
  };
  const remove = async () => {
    if (!playerId) return;
    const stamp = guard.begin(playerId);
    if (!stamp) return;
    setBusy(true);
    try {
      await clearLocalGpsImport(playerId);
      if (guard.isCurrent(stamp)) { setSaved(null); setMessage(null); }
    } catch { if (guard.isCurrent(stamp)) setMessage(t('gps:import.invalid')); }
    finally { finish(stamp); }
  };
  const visiblePreview = preview?.session.playerId === playerId ? preview : null;
  const visibleSaved = saved?.session.playerId === playerId ? saved : null;
  return (
    <Section title={t('gps:import.title')} gap="md">
      <Text variant="caption" color="secondary">{t('gps:import.privacy')}</Text>
      {!visiblePreview ? <Button variant="secondary" leftIcon={<FileUp size={18} />} disabled={!playerId || disabled} loading={busy} onPress={() => void pick()}>{t('gps:import.choose')}</Button> : (
        <View className="gap-3">
          <GpsLiveMetrics metrics={visiblePreview.session.metrics} />
          <Text variant="caption" color="secondary">{t('gps:import.quality', visiblePreview.quality)}</Text>
          <Text variant="caption" color="secondary">{t('gps:import.provenance')}</Text>
          {visiblePreview.session.heatmap.cells.length > 0 ? <GpsHeatmap heatmap={visiblePreview.session.heatmap} /> : null}
          <Input label={t('gps:import.label')} value={label} maxLength={100} onChangeText={setLabel} editable={!busy && !disabled} />
          <Button disabled={!label.trim() || disabled} loading={busy} onPress={() => void confirm()}>{t('gps:import.confirm')}</Button>
          <Button variant="ghost" disabled={busy || disabled} onPress={() => {
            const stamp = guard.begin(playerId);
            if (!stamp) return;
            setPreview(null); setMessage(null); finish(stamp);
          }}>{t('gps:import.cancel')}</Button>
        </View>
      )}
      {message ? <Text variant="body-sm" accessibilityRole="alert">{message}</Text> : null}
      {visibleSaved ? <View className="gap-3">
        <Text variant="label">{visibleSaved.session.matchLabel}</Text>
        <GpsLiveMetrics metrics={visibleSaved.session.metrics} />
        <Text variant="caption" color="secondary">{t('gps:import.provenance')}</Text>
        {visibleSaved.session.heatmap.cells.length > 0 ? <GpsHeatmap heatmap={visibleSaved.session.heatmap} /> : null}
        <Button variant="ghost" disabled={busy || disabled} onPress={() => void remove()}>{t('gps:import.remove')}</Button>
      </View> : null}
    </Section>
  );
}
