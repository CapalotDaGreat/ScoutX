import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export type CompactLayout = {
  width: number;
  height: number;
  isCompact: boolean;
  isTablet: boolean;
  contentWidth: number;
  horizontalPadding: number;
  pipelineColumnWidth: number;
};

const COMPACT_WIDTH = 390;
const TABLET_WIDTH = 768;

export function useCompactLayout(): CompactLayout {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isCompact = width < COMPACT_WIDTH;
    const isTablet = width >= TABLET_WIDTH;
    const horizontalPadding = isTablet ? 24 : isCompact ? 12 : 16;
    const contentWidth = Math.max(0, width - horizontalPadding * 2);
    const pipelineColumnWidth = Math.min(320, Math.max(248, Math.round(contentWidth * 0.84)));

    return {
      width,
      height,
      isCompact,
      isTablet,
      contentWidth,
      horizontalPadding,
      pipelineColumnWidth,
    };
  }, [height, width]);
}
