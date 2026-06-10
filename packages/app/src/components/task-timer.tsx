import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { StoredTask } from "@getpaseo/protocol/task/types";
import { StyleSheet } from "react-native-unistyles";

interface TaskTimerProps {
  task: StoredTask;
  onStart: (task: StoredTask) => void;
  onStop: (task: StoredTask) => void;
}

export function TaskTimer({ task, onStart, onStop }: TaskTimerProps) {
  const { timerStartedAt, trackedSeconds } = task.metadata;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isRunning = Boolean(timerStartedAt);
  const elapsedSeconds = useMemo(
    () => computeElapsedSeconds({ trackedSeconds, timerStartedAt, nowMs }),
    [nowMs, timerStartedAt, trackedSeconds],
  );

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const handleStart = useCallback(() => {
    onStart(task);
  }, [onStart, task]);
  const handlePause = useCallback(() => {
    onStop(task);
  }, [onStop, task]);
  return (
    <View style={styles.timer}>
      <Text style={styles.timerText}>{formatDuration(elapsedSeconds)}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={isRunning ? handlePause : handleStart}
        style={styles.timerButton}
      >
        <Text style={styles.timerButtonText}>{isRunning ? "Pause" : "Start"}</Text>
      </Pressable>
    </View>
  );
}

export function computeElapsedSeconds(input: {
  trackedSeconds: number;
  timerStartedAt: string | null;
  nowMs: number;
}): number {
  if (!input.timerStartedAt) {
    return input.trackedSeconds;
  }
  const startedMs = Date.parse(input.timerStartedAt);
  if (!Number.isFinite(startedMs)) {
    return input.trackedSeconds;
  }
  return input.trackedSeconds + Math.max(0, Math.floor((input.nowMs - startedMs) / 1000));
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

const styles = StyleSheet.create((theme) => ({
  timer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  timerText: {
    minWidth: 42,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontVariant: ["tabular-nums"],
  },
  timerButton: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface2,
  },
  timerButtonText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
}));
