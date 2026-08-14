"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_POSTURE_PRESET,
  POSTURE_PRESETS,
  calculatePostureResult,
  findMatchingPreset,
  getPostureDisplayName,
  normalizeWeights,
  type AggregatePostureResult,
  type PosturePreset,
  type SpecScoreBreakdown,
  type WeightMap,
} from "@/lib/posture";
import {
  battleMetrics,
  data,
  type DecisionMetricKey,
} from "@/lib/data";

interface PostureContextValue {
  weights: WeightMap;
  preset: PosturePreset | null;
  activePresetId: string | null;
  displayName: string;
  displayBadge: string;
  isPreset: boolean;
  normalizedWeights: Record<DecisionMetricKey, number>;
  weightTotal: number;
  postureResult: AggregatePostureResult;
  viewMode: "posture" | "raw";
  setViewMode: (mode: "posture" | "raw") => void;
  setWeights: (weights: WeightMap) => void;
  setMetricWeight: (metric: DecisionMetricKey, value: number) => void;
  selectPreset: (preset: PosturePreset | string) => void;
  resetToDefault: () => void;
  getSpecBreakdown: (specId: string) => SpecScoreBreakdown | undefined;
}

const PostureContext = createContext<PostureContextValue | null>(null);

const STORAGE_KEY = "opus_sol_grok_posture_v2";

export function PostureProvider({ children }: { children: ReactNode }) {
  const [weights, setWeightsState] = useState<WeightMap>(DEFAULT_POSTURE_PRESET.weights);
  const [viewMode, setViewMode] = useState<"posture" | "raw">("posture");
  const [hydrated, setHydrated] = useState(false);

  // Load persisted weights on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          parsed &&
          typeof parsed.quality === "number" &&
          typeof parsed.speed === "number" &&
          typeof parsed.cost === "number"
        ) {
          setWeightsState({
            quality: Math.max(0, Math.min(100, parsed.quality)),
            speed: Math.max(0, Math.min(100, parsed.speed)),
            cost: Math.max(0, Math.min(100, parsed.cost)),
          });
        }
      }
    } catch {
      // Ignore storage errors
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist weights changes
  const setWeights = useCallback((newWeights: WeightMap) => {
    setWeightsState(newWeights);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newWeights));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const setMetricWeight = useCallback((metric: DecisionMetricKey, value: number) => {
    setWeightsState((prev) => {
      const updated = {
        ...prev,
        [metric]: Math.max(0, Math.min(100, value)),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }
      return updated;
    });
  }, []);

  const selectPreset = useCallback((presetOrId: PosturePreset | string) => {
    const target =
      typeof presetOrId === "string"
        ? POSTURE_PRESETS.find((p) => p.id === presetOrId || p.name === presetOrId)
        : presetOrId;
    if (target) {
      setWeights(target.weights);
    }
  }, [setWeights]);

  const resetToDefault = useCallback(() => {
    setWeights(DEFAULT_POSTURE_PRESET.weights);
  }, [setWeights]);

  // Calculations
  const weightTotal = (weights.quality ?? 0) + (weights.speed ?? 0) + (weights.cost ?? 0);
  const normalizedWeights = useMemo(() => normalizeWeights(weights), [weights]);
  const preset = useMemo(() => findMatchingPreset(weights), [weights]);
  const activePresetId = preset?.id ?? null;

  const { name: displayName, badge: displayBadge, isPreset } = useMemo(
    () => getPostureDisplayName(weights),
    [weights],
  );

  const postureResult = useMemo(
    () => calculatePostureResult(battleMetrics, data.specs, weights),
    [weights],
  );

  const getSpecBreakdown = useCallback(
    (specId: string) => postureResult.specBreakdowns.find((s) => s.specId === specId),
    [postureResult],
  );

  const value = useMemo<PostureContextValue>(
    () => ({
      weights,
      preset,
      activePresetId,
      displayName,
      displayBadge,
      isPreset,
      normalizedWeights,
      weightTotal,
      postureResult,
      viewMode,
      setViewMode,
      setWeights,
      setMetricWeight,
      selectPreset,
      resetToDefault,
      getSpecBreakdown,
    }),
    [
      weights,
      preset,
      activePresetId,
      displayName,
      displayBadge,
      isPreset,
      normalizedWeights,
      weightTotal,
      postureResult,
      viewMode,
      setWeights,
      setMetricWeight,
      selectPreset,
      resetToDefault,
      getSpecBreakdown,
    ],
  );

  return (
    <PostureContext.Provider value={value}>
      {children}
    </PostureContext.Provider>
  );
}

export function usePosture(): PostureContextValue {
  const context = useContext(PostureContext);
  if (!context) {
    throw new Error("usePosture must be used within a PostureProvider");
  }
  return context;
}
