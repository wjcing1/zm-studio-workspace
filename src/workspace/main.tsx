import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import WorkspaceApp from "./WorkspaceApp";
import "tldraw/tldraw.css";
import "./workspace-app.css";

type MountOptions = {
  root: HTMLElement;
};

export function mountWorkspaceApp({ root }: MountOptions) {
  root.setAttribute("data-workspace-engine", "tldraw");
  const reactRoot = createRoot(root);

  reactRoot.render(
    <StrictMode>
      <WorkspaceApp />
    </StrictMode>,
  );

  return () => {
    reactRoot.unmount();
  };
}
