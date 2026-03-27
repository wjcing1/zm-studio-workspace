import {
  escapeHtml,
  icon,
  projectDatabase,
  statusClass,
} from "./shared/studio-data-client.js";
import { setupWebApp } from "./shared/register-web-app.js";

setupWebApp();

const projectRows = document.getElementById("projectRows");
const projectStatus = document.getElementById("projectStatus");

function renderProjects() {
  projectStatus.textContent = `System Online • ${projectDatabase.length} Records • Click a row to open its canvas`;

  projectRows.innerHTML = projectDatabase
    .map((project) => {
      const statusIcon =
        project.status === "Completed"
          ? icon("done")
          : project.status === "On Hold"
            ? icon("pause")
            : icon("progress");

      return `
        <div
          class="grid-row"
          data-project-id="${escapeHtml(project.id)}"
          data-workspace-url="./workspace.html?project=${encodeURIComponent(project.id)}"
          tabindex="0"
          role="button"
          aria-label="Open ${escapeHtml(project.name)} canvas"
        >
          <div class="mono">
            ${escapeHtml(project.id)}
            <span class="project-open-label">Canvas</span>
          </div>
          <div>
            <span class="project-name">${escapeHtml(project.name)}</span>
            <span class="project-client">${escapeHtml(project.client)}</span>
          </div>
          <div>
            <span class="status-pill ${statusClass(project.status)}">
              ${statusIcon}
              ${escapeHtml(project.status)}
            </span>
          </div>
          <div class="budget">${escapeHtml(project.budget)}</div>
          <div class="team-stack">
            <div class="lead-badge">
              <span class="lead-avatar">${escapeHtml(project.manager)}</span>
              <span class="lead-label">Lead</span>
            </div>
            <div class="team-members">
              ${project.team
                .map(
                  (member) => `
                    <div class="member-chip">
                      <span class="member-avatar">${escapeHtml(member.name.charAt(0))}</span>
                      <span class="member-tooltip">${escapeHtml(member.name)} • ${escapeHtml(member.role)}</span>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function openProject(projectId) {
  window.location.assign(`./workspace.html?project=${encodeURIComponent(projectId)}`);
}

projectRows.addEventListener("click", (event) => {
  const row = event.target.closest("[data-project-id]");
  if (!row) return;
  openProject(row.dataset.projectId || "");
});

projectRows.addEventListener("keydown", (event) => {
  const row = event.target.closest("[data-project-id]");
  if (!row) return;

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openProject(row.dataset.projectId || "");
  }
});

renderProjects();
