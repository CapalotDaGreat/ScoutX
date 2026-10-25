import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { RotateCcw, Save } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';
import { containImageRect, containPointToNormalized, cornersToNormalizedBox, parseNormalizedTargetBox, type NormalizedTargetBox, type TargetPoint, type TargetSize } from '../services/targetAnchorGeometry';

export type TargetAnchorEditorProps = {
  imageUri: string;
  onSave: (box: NormalizedTargetBox) => Promise<void>;
  disabled?: boolean;
  initialBox?: NormalizedTargetBox;
};

export function TargetAnchorEditor(props: TargetAnchorEditorProps) {
  return <ImageEditor key={props.imageUri} {...props} />;
}

const fields = ['x', 'y', 'width', 'height'] as const;
const emptyFields = { x: '', y: '', width: '', height: '' };
const boxFields = (box: NormalizedTargetBox) => ({
  x: String(box.x * 100), y: String(box.y * 100), width: String(box.width * 100), height: String(box.height * 100),
});

function ImageEditor({ imageUri, onSave, disabled = false, initialBox }: TargetAnchorEditorProps) {
  const { t } = useAppTranslation('matchAnalysis');
  const { colors } = useTheme();
  const [image, setImage] = useState<TargetSize | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [container, setContainer] = useState<TargetSize>({ width: 0, height: 240 });
  const [first, setFirst] = useState<TargetPoint | null>(null);
  const [values, setValues] = useState(() => {
    const initial = parseNormalizedTargetBox(initialBox);
    return initial ? boxFields(initial) : emptyFields;
  });
  const [selectedBox, setSelectedBox] = useState<NormalizedTargetBox | null>(() => parseNormalizedTargetBox(initialBox));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [hoverReset, setHoverReset] = useState(false);
  const alive = useRef(true);
  const saving = useRef(false);
  const pressPoint = useRef<TargetPoint | null>(null);
  const handleImageLoad = useCallback(() => { if (alive.current) setLoaded(true); }, []);
  const handleImageError = useCallback(() => {
    if (!alive.current) return;
    setFailed(true); setLoaded(false); setValues(emptyFields); setSelectedBox(null); setFirst(null);
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    let active = true;
    Image.getSize(imageUri, (width, height) => {
      if (!active || !alive.current) return;
      if (containImageRect({ width: 1, height: 1 }, { width, height })) setImage({ width, height });
      else setFailed(true);
    }, () => { if (active && alive.current) setFailed(true); });
    return () => { active = false; };
  }, [imageUri]);
  const box = selectedBox ?? (fields.every(key => values[key].trim() !== '' && /^\d*(?:[.,]\d+)?$/.test(values[key].trim()))
    ? parseNormalizedTargetBox(Object.fromEntries(fields.map(key => [key, Number(values[key].replace(',', '.')) / 100]))) : null);
  const rect = image ? containImageRect(container, image) : null;
  const ready = loaded && !failed && !!rect;
  const locked = disabled || busy || !ready;
  const selectBox = (next: NormalizedTargetBox) => {
    setSelectedBox(next);
    setValues(boxFields(next));
  };
  const save = async () => {
    if (locked || !box || first || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(false);
    try { await onSave(box); }
    catch { if (alive.current) setError(true); }
    finally { if (alive.current) { saving.current = false; setBusy(false); } }
  };
  return (
    <View className="gap-3">
      <Text variant="label">{t('targetAnchor.title')}</Text>
      <Text variant="caption" color="secondary">{t(first ? 'targetAnchor.secondCorner' : 'targetAnchor.firstCorner')}</Text>
      <Pressable
        accessibilityRole="button" accessibilityLabel={t('targetAnchor.image')} accessibilityState={{ disabled: locked }}
        disabled={locked}
        style={{ height: 240, width: '100%', overflow: 'hidden', backgroundColor: colors.surface }}
        onLayout={event => setContainer(event.nativeEvent.layout)}
        onPressIn={event => {
          // Web onPress carries a MouseEvent; press-in provides normalized local coordinates.
          pressPoint.current = !locked && !saving.current && image
            ? containPointToNormalized({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }, container, image) : null;
        }}
        onPress={() => {
          if (locked || saving.current || !image) return;
          const point = pressPoint.current;
          pressPoint.current = null;
          if (!point) return;
          setError(false);
          if (!first) { setFirst(point); setSelectedBox(null); setValues(emptyFields); }
          else {
            const next = cornersToNormalizedBox(first, point);
            if (next) { selectBox(next); setFirst(null); }
          }
        }}
      >
        <View pointerEvents="none" style={{ width: '100%', height: '100%' }}>
        <Image source={{ uri: imageUri }} resizeMode="contain" style={{ width: '100%', height: '100%' }}
          accessible={false}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
        </View>
        {ready && rect && box ? <View pointerEvents="none" style={{ position: 'absolute', left: rect.x + box.x * rect.width, top: rect.y + box.y * rect.height, width: box.width * rect.width, height: box.height * rect.height, borderWidth: 2, borderColor: colors.accent }} /> : null}
        {ready && rect && first ? <View pointerEvents="none" style={{ position: 'absolute', left: rect.x + first.x * rect.width - 4, top: rect.y + first.y * rect.height - 4, width: 8, height: 8, backgroundColor: colors.accent }} /> : null}
      </Pressable>
      {failed ? <Text color="error" accessibilityRole="alert">{t('targetAnchor.imageError')}</Text> : null}
      <View className="flex-row flex-wrap gap-3">
        {fields.map(key => <Input key={key} label={t(`targetAnchor.${key}`)} accessibilityLabel={t(`targetAnchor.${key}`)} keyboardType="decimal-pad" editable={!locked}
          containerClassName="grow basis-[120px]" value={values[key]} onChangeText={value => { if (locked || saving.current) return; setSelectedBox(null); setFirst(null); setError(false); setValues(current => ({ ...current, [key]: value })); }} />)}
      </View>
      {!box && fields.some(key => values[key] !== '') ? <Text variant="caption" color="error" accessibilityRole="alert">{t('targetAnchor.invalid')}</Text> : null}
      {error ? <Text color="error" accessibilityRole="alert">{t('targetAnchor.saveError')}</Text> : null}
      <View className="flex-row flex-wrap items-center gap-3">
        <View>
        <Button variant="ghost" disabled={locked} accessibilityLabel={t('targetAnchor.reset')}
          className="h-12 w-12 px-0"
          onHoverIn={() => setHoverReset(true)} onHoverOut={() => setHoverReset(false)}
          onFocus={() => setHoverReset(true)} onBlur={() => setHoverReset(false)}
          onPress={() => { if (locked || saving.current) return; setValues(emptyFields); setSelectedBox(null); setFirst(null); setError(false); }}>
          <RotateCcw size={20} color={colors.textPrimary} />
        </Button>
        {hoverReset ? <View pointerEvents="none" style={{ position: 'absolute', bottom: 52, left: 0, width: 160, backgroundColor: colors.surfaceElevated, padding: 8 }}><Text variant="caption">{t('targetAnchor.reset')}</Text></View> : null}
        </View>
        <Button disabled={locked || !box || !!first} loading={busy} leftIcon={<Save size={18} color={colors.primaryForeground} />} onPress={() => void save()}>{t('targetAnchor.save')}</Button>
      </View>
    </View>
  );
}
