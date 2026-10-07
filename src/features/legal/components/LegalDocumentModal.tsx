import { ScrollView } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { LegalDocumentView } from '@/features/legal/components/LegalDocumentView';
import { getLegalDocument } from '@/features/legal/consentModel';
import { type LegalDocumentId } from '@/features/legal/types';

export function LegalDocumentModal({
  documentId,
  onClose,
}: {
  documentId: LegalDocumentId | null;
  onClose: () => void;
}) {
  if (!documentId) return null;
  const document = getLegalDocument(documentId);
  return (
    <Modal visible onClose={onClose} title={document.title} size="fullscreen">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <LegalDocumentView document={document} />
      </ScrollView>
    </Modal>
  );
}
