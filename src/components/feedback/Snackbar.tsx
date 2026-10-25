import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export type SnackbarOptions = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Runs when the snackbar disappears without its action being pressed. */
  onTimeout?: () => void;
  durationMs?: number;
};

type ActiveSnackbar = SnackbarOptions & { id: number };

type SnackbarContextValue = {
  showSnackbar: (options: SnackbarOptions) => void;
};

type SnackbarHostContextValue = {
  active: ActiveSnackbar | null;
  pressAction: () => void;
  registerHost: () => { id: number; unregister: () => void };
  topHostId: number;
};

const SnackbarContext = createContext<SnackbarContextValue | null>(null);
const SnackbarHostContext = createContext<SnackbarHostContextValue | null>(null);

const DEFAULT_DURATION_MS = 5000;
/** Keeps the snackbar above the player/scout tab bars and modal footers. */
const BOTTOM_CLEARANCE = 96;

let nextHostId = 1;

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveSnackbar | null>(null);
  const [hostIds, setHostIds] = useState<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<ActiveSnackbar | null>(null);

  const settle = useCallback((pressedAction: boolean) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const current = activeRef.current;
    activeRef.current = null;
    setActive(null);
    if (!current) {
      return;
    }
    if (pressedAction) {
      current.onAction?.();
    } else {
      current.onTimeout?.();
    }
  }, []);

  const showSnackbar = useCallback(
    (options: SnackbarOptions) => {
      // A pending snackbar is committed (not undone) when a new one replaces it.
      settle(false);
      const next: ActiveSnackbar = { ...options, id: Date.now() };
      activeRef.current = next;
      setActive(next);
      timerRef.current = setTimeout(() => settle(false), options.durationMs ?? DEFAULT_DURATION_MS);
    },
    [settle],
  );

  const registerHost = useCallback(() => {
    const id = nextHostId++;
    setHostIds((current) => [...current, id]);
    return {
      id,
      unregister: () => setHostIds((current) => current.filter((hostId) => hostId !== id)),
    };
  }, []);

  useEffect(() => () => settle(false), [settle]);

  const value = useMemo(() => ({ showSnackbar }), [showSnackbar]);
  const hostValue = useMemo<SnackbarHostContextValue>(
    () => ({
      active,
      pressAction: () => settle(true),
      registerHost,
      topHostId: hostIds.length > 0 ? Math.max(...hostIds) : 0,
    }),
    [active, hostIds, registerHost, settle],
  );

  return (
    <SnackbarContext.Provider value={value}>
      <SnackbarHostContext.Provider value={hostValue}>
        {children}
        <SnackbarHost />
      </SnackbarHostContext.Provider>
    </SnackbarContext.Provider>
  );
}

/**
 * Renders the active snackbar. Native modals cover the root view, so `Modal` mounts its own
 * host; only the most recently mounted host draws, keeping the snackbar visible and single.
 */
export function SnackbarHost() {
  const context = useContext(SnackbarHostContext);
  const [hostId, setHostId] = useState(0);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const registerHost = context?.registerHost;

  useEffect(() => {
    if (!registerHost) {
      return;
    }
    const { id, unregister } = registerHost();
    setHostId(id);
    return unregister;
  }, [registerHost]);

  if (!context?.active || hostId === 0 || context.topHostId !== hostId) {
    return null;
  }
  const { active, pressAction } = context;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + BOTTOM_CLEARANCE }}
    >
      <Animated.View
        key={active.id}
        entering={reducedMotion ? undefined : FadeInDown.duration(180)}
        exiting={reducedMotion ? undefined : FadeOutDown.duration(150)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={{
          backgroundColor: colors.textPrimary,
          borderRadius: 8,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Text className="min-w-0 flex-1" style={{ color: colors.surface }}>
          {active.message}
        </Text>
        {active.actionLabel && active.onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={active.actionLabel}
            hitSlop={12}
            onPress={pressAction}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
          >
            <Text weight="bold" style={{ color: colors.accent }}>
              {active.actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

export function useSnackbar(): SnackbarContextValue {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within SnackbarProvider.');
  }
  return context;
}
