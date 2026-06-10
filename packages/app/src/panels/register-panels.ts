import { agentPanelRegistration } from "@/panels/agent-panel";
import { browserPanelRegistration } from "@/panels/browser-panel";
import { draftPanelRegistration } from "@/panels/draft-panel";
import { filePanelRegistration } from "@/panels/file-panel";
import {
  notesPanelRegistration,
  projectAgentsPanelRegistration,
  projectContextPanelRegistration,
  projectFilesPanelRegistration,
  projectNotesPanelRegistration,
  projectOverviewPanelRegistration,
  projectTasksPanelRegistration,
  tasksPanelRegistration,
} from "@/panels/project-panels";
import { registerPanel } from "@/panels/panel-registry";
import { setupPanelRegistration } from "@/panels/setup-panel";
import { terminalPanelRegistration } from "@/panels/terminal-panel";

let panelsRegistered = false;

export function ensurePanelsRegistered(): void {
  if (panelsRegistered) {
    return;
  }
  registerPanel(draftPanelRegistration);
  registerPanel(agentPanelRegistration);
  registerPanel(setupPanelRegistration);
  registerPanel(terminalPanelRegistration);
  registerPanel(browserPanelRegistration);
  registerPanel(filePanelRegistration);
  registerPanel(projectOverviewPanelRegistration);
  registerPanel(tasksPanelRegistration);
  registerPanel(notesPanelRegistration);
  registerPanel(projectTasksPanelRegistration);
  registerPanel(projectNotesPanelRegistration);
  registerPanel(projectAgentsPanelRegistration);
  registerPanel(projectContextPanelRegistration);
  registerPanel(projectFilesPanelRegistration);
  panelsRegistered = true;
}
