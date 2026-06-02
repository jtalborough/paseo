import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { GitLogEntry } from "@getpaseo/protocol/messages";
import { commitDiffQueryKey, gitLogQueryKey } from "@/git/query-keys";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

export const GIT_LOG_PAGE_SIZE = 100;

interface UseGitLogQueryOptions {
  serverId: string;
  cwd: string;
  enabled?: boolean;
}

interface GitLogQueryData {
  commits: GitLogEntry[];
  hasMore: boolean;
}

export function useGitLogQuery({ serverId, cwd, enabled = true }: UseGitLogQueryOptions) {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  // Capped fetch: grow the window on "Load more" rather than paginating with skip,
  // so the cache always holds a single contiguous slice from the tip.
  const [limit, setLimit] = useState(GIT_LOG_PAGE_SIZE);

  const query = useQuery<GitLogQueryData>({
    queryKey: [...gitLogQueryKey(serverId, cwd), limit],
    queryFn: async () => {
      if (!client) {
        throw new Error("Daemon client not available");
      }
      const payload = await client.listGitLog(cwd, { limit, skip: 0 });
      if (payload.error) {
        throw new Error(payload.error.message);
      }
      return { commits: payload.commits, hasMore: payload.hasMore };
    },
    enabled: !!client && isConnected && !!cwd && enabled,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const loadMore = useCallback(() => {
    if (query.data?.hasMore) {
      setLimit((current) => current + GIT_LOG_PAGE_SIZE);
    }
  }, [query.data?.hasMore]);

  return {
    commits: query.data?.commits ?? [],
    hasMore: query.data?.hasMore ?? false,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    loadMore,
  };
}

interface UseCommitDiffQueryOptions {
  serverId: string;
  cwd: string;
  sha: string | null;
}

export function useCommitDiffQuery({ serverId, cwd, sha }: UseCommitDiffQueryOptions) {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);

  const query = useQuery({
    queryKey: commitDiffQueryKey(serverId, cwd, sha ?? ""),
    queryFn: async () => {
      if (!client) {
        throw new Error("Daemon client not available");
      }
      if (!sha) {
        throw new Error("Commit sha is required");
      }
      const payload = await client.getCommitDiff(cwd, sha);
      if (payload.error) {
        throw new Error(payload.error.message);
      }
      return payload.files;
    },
    enabled: !!client && isConnected && !!cwd && !!sha,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  return {
    files: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
