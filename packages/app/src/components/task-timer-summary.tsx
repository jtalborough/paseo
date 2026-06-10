import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StyleSheet } from "react-native-unistyles";
import type { StoredTask } from "@getpaseo/protocol/task/types";
import { formatDuration } from "@/components/task-timer";
import { useSessionStore } from "@/stores/session-store";
import { computeElapsedSeconds } from "@/components/task-timer";
import { totalSecondsForDay } from "@/utils/task-time";
import { buildHostTaskRoute, buildHostTasksRoute } from "@/utils/host-routes";

const EMPTY_TASKS: StoredTask[] = [];

function useClient(serverId: string | null) {
  return useSessionStore((state) => (serverId ? (state.sessions[serverId]?.client ?? null) : null));
}

export function TaskTimerSummary({
  serverId,
  placement = "sidebar",
}: {
  serverId: string | null;
  placement?: "header" | "sidebar";
}) {
  const client = useClient(serverId);
  const queryClient = useQueryClient();
  const supported = useSessionStore((state) =>
    serverId ? state.sessions[serverId]?.serverInfo?.features?.tasks === true : false,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const query = useQuery({
    queryKey: ["tasks", serverId],
    enabled: Boolean(client && supported),
    queryFn: async () => (client ? client.taskQuery() : EMPTY_TASKS),
    staleTime: 2_000,
    refetchInterval: 5_000,
  });
  const tasks = query.data ?? EMPTY_TASKS;
  const activeTask = tasks.find((task) => Boolean(task.metadata.timerStartedAt)) ?? null;
  const stopTimer = useMutation({
    mutationFn: async (task: StoredTask) => {
      if (!client) throw new Error("Host is not connected");
      return client.taskTimerStop(task.metadata.projectGroupId, task.metadata.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks", serverId] });
      await queryClient.invalidateQueries({ queryKey: ["project-tasks", serverId] });
    },
  });

  useEffect(() => {
    if (!activeTask) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeTask]);

  const todayTotal = useMemo(
    () => totalSecondsForDay(tasks, new Date(nowMs), new Date(nowMs)),
    [nowMs, tasks],
  );
  const currentSeconds = activeTask
    ? computeElapsedSeconds({
        trackedSeconds: 0,
        timerStartedAt: activeTask.metadata.timerStartedAt,
        nowMs,
      })
    : 0;
  const stopTimerMutate = stopTimer.mutate;
  const handleOpenTask = useCallback(() => {
    if (!serverId || !activeTask) {
      return;
    }
    router.push(
      buildHostTaskRoute(serverId, activeTask.metadata.projectGroupId, activeTask.metadata.id),
    );
  }, [activeTask, serverId]);
  const handleOpenTasks = useCallback(() => {
    if (!serverId) {
      return;
    }
    router.push(buildHostTasksRoute(serverId));
  }, [serverId]);
  const handleStop = useCallback(() => {
    if (activeTask) {
      stopTimerMutate(activeTask);
    }
  }, [activeTask, stopTimerMutate]);

  if (!supported || (!activeTask && todayTotal === 0)) {
    return null;
  }

  return (
    <View style={placement === "sidebar" ? styles.sidebarSummary : styles.summary}>
      {activeTask ? (
        <View style={placement === "sidebar" ? styles.sidebarCurrentRow : styles.currentRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open task ${activeTask.metadata.title}`}
            onPress={handleOpenTask}
            style={styles.currentButton}
          >
            <Text
              style={placement === "sidebar" ? styles.sidebarCurrent : styles.current}
              numberOfLines={1}
            >
              {activeTask.metadata.title} {formatDuration(currentSeconds)}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop task timer"
            onPress={handleStop}
            disabled={stopTimer.isPending}
            style={styles.stopButton}
          >
            <Text style={styles.stopButtonText}>Stop</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Tasks"
        onPress={handleOpenTasks}
        style={styles.totalButton}
      >
        <Text
          style={placement === "sidebar" ? styles.sidebarTotal : styles.total}
          numberOfLines={1}
        >
          Today {formatDuration(todayTotal)}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  sidebarSummary: {
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
  currentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  sidebarCurrentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  currentButton: { flex: 1, minWidth: 0 },
  totalButton: { alignSelf: "flex-start" },
  current: {
    maxWidth: 280,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: {
      xs: "400",
      md: "300",
    },
    fontVariant: ["tabular-nums"],
  },
  total: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: {
      xs: "400",
      md: "300",
    },
    fontVariant: ["tabular-nums"],
  },
  sidebarCurrent: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    fontVariant: ["tabular-nums"],
  },
  sidebarTotal: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    fontVariant: ["tabular-nums"],
  },
  stopButton: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface2,
  },
  stopButtonText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
}));
