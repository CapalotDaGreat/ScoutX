import './global.css';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { StatusBar } from 'expo-status-bar';
import { Plus, Trophy } from 'lucide-react-native';
import {
  Avatar,
  Badge,
  BottomSheet,
  type BottomSheetRef,
  Button,
  Card,
  Dropdown,
  EmptyState,
  FloatingActionButton,
  Heading,
  Input,
  LoadingScreen,
  Modal,
  NotificationCard,
  ProgressBar,
  Screen,
  SearchBar,
  Section,
  SkeletonLoader,
  StatCard,
  Text,
} from '@/components';
import { ThemeProvider, useTheme } from '@/theme';

function DesignSystemShowcase() {
  const { colors } = useTheme();
  const bottomSheetRef = useRef<BottomSheetRef>(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [position, setPosition] = useState('forward');
  const [showLoading, setShowLoading] = useState(false);

  const positionOptions = useMemo(
    () => [
      { label: 'Forward', value: 'forward' },
      { label: 'Midfielder', value: 'midfielder' },
      { label: 'Defender', value: 'defender' },
      { label: 'Goalkeeper', value: 'goalkeeper' },
    ],
    [],
  );

  const handleOpenSheet = useCallback(() => {
    bottomSheetRef.current?.expand();
  }, []);

  if (showLoading) {
    return <LoadingScreen message="Loading design system" />;
  }

  return (
    <View className="flex-1">
      <Screen
        title="ScoutX Design System"
        subtitle="Production-ready reusable components"
        onRefresh={() => setShowLoading(true)}
        refreshing={false}
      >
        <Section title="Typography" gap="sm">
          <Heading level={1}>Heading 1</Heading>
          <Heading level={2}>Heading 2</Heading>
          <Text variant="body-lg">Body large text for primary content.</Text>
          <Text variant="body-sm" color="secondary">
            Secondary body text for descriptions.
          </Text>
        </Section>

        <Section title="Buttons" className="mt-8">
          <Button variant="primary">Primary</Button>
          <Button variant="accent">Accent</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="accent" loading>
            Loading
          </Button>
        </Section>

        <Section title="Cards & Stats" className="mt-8">
          <Card>
            <Text className="font-sans-semibold">Default Card</Text>
            <Text variant="body-sm" color="secondary" className="mt-1">
              Premium surface with consistent spacing.
            </Text>
          </Card>
          <View className="flex-row gap-3">
            <StatCard label="Goals" value={24} trend={{ value: '+12%', direction: 'up' }} />
            <StatCard
              label="Assists"
              value={18}
              trend={{ value: '-3%', direction: 'down' }}
              variant="elevated"
            />
          </View>
        </Section>

        <Section title="Avatars & Badges" className="mt-8">
          <View className="flex-row items-center gap-3">
            <Avatar name="Marcus Silva" size="lg" showBorder />
            <Avatar name="Scout" size="md" />
            <Badge label="Pro" variant="accent" />
            <Badge label="Verified" variant="success" />
          </View>
        </Section>

        <Section title="Progress" className="mt-8">
          <ProgressBar value={72} showLabel />
        </Section>

        <Section title="Form Controls" className="mt-8">
          <SearchBar
            value={search}
            onChangeText={setSearch}
            onClear={() => setSearch('')}
            placeholder="Search players"
          />
          <Input label="Email" placeholder="you@club.com" />
          <Dropdown
            label="Position"
            options={positionOptions}
            value={position}
            onChange={setPosition}
          />
        </Section>

        <Section title="Feedback" className="mt-8">
          <SkeletonLoader variant="card" count={2} />
          <NotificationCard
            title="Trial Invitation"
            body="FC Basel invited you to a training session."
            timestamp="2m ago"
            type="trial"
            avatarName="FC Basel"
          />
          <Button variant="secondary" onPress={() => setModalOpen(true)}>
            Open Modal
          </Button>
          <Button variant="secondary" onPress={handleOpenSheet}>
            Open Bottom Sheet
          </Button>
        </Section>

        <Section title="Empty State" className="mt-8">
          <Card padding="none">
            <EmptyState
              icon={<Trophy size={48} color={colors.textTertiary} strokeWidth={1.5} />}
              title="No achievements yet"
              description="Complete sessions to unlock your first badge."
              actionLabel="Start Training"
            />
          </Card>
        </Section>
      </Screen>

      <FloatingActionButton
        icon={<Plus size={24} color={colors.accentForeground} strokeWidth={2} />}
        accessibilityLabel="Create"
      />

      <Modal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Modal"
        size="sheet"
      >
        <ScrollView className="px-4 pb-6">
          <Text variant="body" color="secondary">
            Modal content with sheet presentation and accessible close controls.
          </Text>
          <Button variant="accent" className="mt-6" onPress={() => setModalOpen(false)}>
            Done
          </Button>
        </ScrollView>
      </Modal>

      <BottomSheet ref={bottomSheetRef} title="Filters" index={-1}>
        <Text variant="body" color="secondary" className="mb-4">
          Bottom sheet for filters, pickers, and contextual actions.
        </Text>
        <Button variant="accent" onPress={() => bottomSheetRef.current?.close()}>
          Apply Filters
        </Button>
      </BottomSheet>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return <LoadingScreen message="Loading fonts" />;
  }

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <ThemeProvider>
          <BottomSheetModalProvider>
            <StatusBar style="auto" />
            <DesignSystemShowcase />
          </BottomSheetModalProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
