import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { LEGAL_REVIEW_REQUIRED, resolveLegalTokens } from '@/config/legalConfig';
import { type LegalBlock, type LegalDocument } from '@/features/legal/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

function Block({ block }: { block: LegalBlock }) {
  if (block.type === 'paragraph') {
    return <Text variant="body-sm">{resolveLegalTokens(block.text)}</Text>;
  }
  return (
    <View className="gap-1">
      {block.items.map((item, index) => (
        <View key={`${index}-${item.slice(0, 12)}`} className="flex-row gap-2">
          <Text variant="body-sm" color="secondary">
            {block.ordered ? `${index + 1}.` : '•'}
          </Text>
          <Text variant="body-sm" className="flex-1">
            {resolveLegalTokens(item)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Plain-language summary on top, full sections expandable underneath. English is canonical. */
export function LegalDocumentView({ document }: { document: LegalDocument }) {
  const { t, i18n } = useAppTranslation('legal');
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  const toggle = (index: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <View className="gap-4" testID={`legal-document-${document.id}`}>
      <View className="gap-1">
        <Heading level={2}>{document.title}</Heading>
        <Text variant="caption" color="secondary">
          {t('version', { version: document.version })} ·{' '}
          {document.effectiveDate === LEGAL_REVIEW_REQUIRED
            ? t('effectivePending')
            : t('effectiveDate', { date: document.effectiveDate })}
        </Text>
      </View>

      {document.status !== 'final' ? (
        <Card variant="outlined" padding="sm">
          <Text variant="caption" color="secondary">
            {t('reviewBanner')}
          </Text>
        </Card>
      ) : null}
      {i18n.language !== document.canonicalLanguage ? (
        <Text variant="caption" color="tertiary">
          {t('translationNotice')}
        </Text>
      ) : null}

      <Card variant="elevated" padding="md" className="gap-2">
        <Text variant="overline" color="secondary">
          {t('summaryTitle')}
        </Text>
        {document.summary.map((line) => (
          <View key={line.slice(0, 24)} className="flex-row gap-2">
            <Text variant="body-sm" color="accent">
              •
            </Text>
            <Text variant="body-sm" className="flex-1">
              {resolveLegalTokens(line)}
            </Text>
          </View>
        ))}
      </Card>

      <View className="gap-2">
        {document.sections.map((section, index) => {
          const expanded = open.has(index);
          return (
            <Card key={section.heading} variant="outlined" padding="md" className="gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => toggle(index)}
                className="flex-row items-center justify-between gap-3"
              >
                <Text weight="semibold" className="flex-1">
                  {section.heading}
                </Text>
                <Text color="secondary">{expanded ? '−' : '+'}</Text>
              </Pressable>
              {expanded ? section.blocks.map((block, blockIndex) => <Block key={blockIndex} block={block} />) : null}
            </Card>
          );
        })}
      </View>
    </View>
  );
}
