export function buildProjectAgentProfileLaunchLabels(input: {
  projectGroupId: string;
  profilePath: string;
  contextPacketPath: string;
}): Record<string, string> {
  return {
    launchSource: "project-agent-profile",
    projectGroupId: input.projectGroupId,
    profilePath: input.profilePath,
    contextPacket: input.contextPacketPath,
  };
}
