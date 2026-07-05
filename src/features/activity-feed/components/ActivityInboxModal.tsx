import { Modal } from '@/components/feedback/Modal';
import { ActivityInboxScreen } from '@/features/activity-feed/components/ActivityInboxScreen';

export type ActivityInboxModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function ActivityInboxModal({ visible, onClose }: ActivityInboxModalProps) {
  return (
    <Modal visible={visible} onClose={onClose} size="fullscreen" showCloseButton>
      <ActivityInboxScreen onBack={onClose} />
    </Modal>
  );
}
