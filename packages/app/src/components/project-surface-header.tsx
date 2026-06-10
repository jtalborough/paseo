import { Pressable } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ScreenHeader } from "@/components/headers/screen-header";
import { ScreenTitle } from "@/components/headers/screen-title";
import { SidebarMenuToggle } from "@/components/headers/menu-header";
import type { Theme } from "@/styles/theme";

export type ProjectSurfaceTab =
  | "overview"
  | "tasks"
  | "notes"
  | "agents"
  | "context"
  | "files"
  | "browser";

interface ProjectSurfaceHeaderProps {
  title: string;
  onBack?: () => void;
}

const arrowColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedArrowLeft = withUnistyles(ArrowLeft);

export function ProjectSurfaceHeader({ title, onBack }: ProjectSurfaceHeaderProps) {
  return (
    <ScreenHeader
      left={
        <>
          {onBack ? <ProjectSurfaceBackButton onBack={onBack} /> : <SidebarMenuToggle />}
          <ScreenTitle>{title}</ScreenTitle>
        </>
      }
      leftStyle={styles.headerLeft}
    />
  );
}

function ProjectSurfaceBackButton({ onBack }: { onBack: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onBack}
      style={styles.backButton}
    >
      <ThemedArrowLeft size={18} uniProps={arrowColorMapping} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  headerLeft: {
    gap: theme.spacing[2],
  },
  backButton: {
    padding: {
      xs: theme.spacing[3],
      md: theme.spacing[2],
    },
    borderRadius: theme.borderRadius.lg,
  },
}));
