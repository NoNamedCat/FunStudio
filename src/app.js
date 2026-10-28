// FunStudio Web IDE - Client Controller
// Professional IDE for WCH CH32 RISC-V Microcontrollers & ch32fun SDK

import { THEMES } from "./themes.js";
import { setLanguage, getLanguage, applyTranslations, t } from "./i18n.js";
import {
  MCU_PROFILES,
  BLANK_TEMPLATE,
  FUNCONFIG_H,
  CH32FUN_LD,
  EXAMPLES_CATALOGUE,
} from "./catalogue.js";
import { ProjectManager } from "./projects.js";

// State
const projectManager = new ProjectManager();
let editor = null;
let currentWorker = null;
let compiledArtifacts = null;
let activeFile = "main.c";
let diagnosticsList = [];
let autoSaveTimer = null;

// UI Elements - Navigation & Topbar
const compileBtn = document.getElementById("compileBtn");
const cleanBtn = document.getElementById("cleanBtn");
const downloadBtn = document.getElementById("downloadBtn");
const downloadModal = document.getElementById("downloadModal");
const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
const togglePanelBtn = document.getElementById("togglePanelBtn");
const sidebar = document.getElementById("sidebar");
const bottomPanel = document.getElementById("bottomPanel");
const buildProgress = document.getElementById("buildProgress");
const terminalOutput = document.getElementById("terminalOutput");
const clearTerminalBtn = document.getElementById("clearTerminalBtn");
const closePanelBtn = document.getElementById("closePanelBtn");
const problemCountBadge = document.getElementById("problemCountBadge");
const problemsList = document.getElementById("problemsList");

const themeSelect = document.getElementById("themeSelect");
const langSelect = document.getElementById("langSelect");
const mcuSelect = document.getElementById("mcuSelect");
const archSelect = document.getElementById("archSelect");
const optSelect = document.getElementById("optSelect");

const topChipBadge = document.getElementById("topChipBadge");
const topArchBadge = document.getElementById("topArchBadge");
const topOptBadge = document.getElementById("topOptBadge");
const statusTarget = document.getElementById("statusTarget");
const statusState = document.getElementById("statusState");
const statusTime = document.getElementById("statusTime");
const statusTimeVal = document.getElementById("statusTimeVal");
const statusProjectName = document.getElementById("statusProjectName");
const cursorPos = document.getElementById("cursorPos");
const breadcrumbProject = document.getElementById("breadcrumbProject");
const breadcrumbCurrentFile = document.getElementById("breadcrumbCurrentFile");

const topbarProjectBtn = document.getElementById("topbarProjectBtn");
const topbarProjectName = document.getElementById("topbarProjectName");
const explorerProjectName = document.getElementById("explorerProjectName");
const explorerMcuBadge = document.getElementById("explorerMcuBadge");
const projectFilesContainer = document.getElementById("projectFilesContainer");
const editorTabs = document.getElementById("editorTabs");

// Modals & Project Controls
const newProjectModal = document.getElementById("newProjectModal");
const closeNewProjectModalBtn = document.getElementById("closeNewProjectModalBtn");
const cancelNewProjectModalBtn = document.getElementById("cancelNewProjectModalBtn");
const confirmCreateProjectBtn = document.getElementById("confirmCreateProjectBtn");
const newProjectNameInput = document.getElementById("newProjectNameInput");
const newProjectMcuSelect = document.getElementById("newProjectMcuSelect");
const newProjectTemplateSelect = document.getElementById("newProjectTemplateSelect");

const newFileModal = document.getElementById("newFileModal");
const btnNewFile = document.getElementById("btnNewFile");
const closeNewFileModalBtn = document.getElementById("closeNewFileModalBtn");
const cancelNewFileModalBtn = document.getElementById("cancelNewFileModalBtn");
const confirmCreateFileBtn = document.getElementById("confirmCreateFileBtn");
const newFileNameInput = document.getElementById("newFileNameInput");
const btnExportZip = document.getElementById("btnExportZip");

// Examples & Projects View
const exampleSearchInput = document.getElementById("exampleSearchInput");
const examplesMcuFilter = document.getElementById("examplesMcuFilter");
const examplesListContainer = document.getElementById("examplesListContainer");
const examplesTotalCount = document.getElementById("examplesTotalCount");
const savedProjectsListContainer = document.getElementById("savedProjectsListContainer");
const btnOpenNewProjectModal = document.getElementById("btnOpenNewProjectModal");

// 1. Monaco Editor Initialization
async function initMonaco() {
  return new Promise((resolve) => {
    require.config({
      paths: {
        vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs",
      },
    });

    require(["vs/editor/editor.main"], () => {
      // Define custom themes
      Object.entries(THEMES).forEach(([id, theme]) => {
        if (theme.rules && theme.colors) {
          monaco.editor.defineTheme(theme.editorTheme, {
            base: theme.type === "light" ? "vs" : "vs-dark",
            inherit: true,
            rules: theme.rules,
            colors: theme.colors,
          });
        }
      });

      const currentProj = projectManager.getActiveProject();
      const initialCode = currentProj.files[activeFile] || BLANK_TEMPLATE;

      editor = monaco.editor.create(document.getElementById("monaco-host"), {
        value: initialCode,
        language: getLanguageForFile(activeFile),
        theme: "vs-dark",
        automaticLayout: true,
        fontSize: 13,
        fontFamily: "'Fira Code', Consolas, monospace",
        fontLigatures: true,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        smoothScrolling: true,
        lineNumbers: "on",
        renderLineHighlight: "all",
        tabSize: 4,
        insertSpaces: true,
      });

      editor.onDidChangeCursorPosition((e) => {
        cursorPos.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
      });

      // Auto-save changes to project in browser localStorage
      editor.onDidChangeModelContent(() => {
        const curProj = projectManager.getActiveProject();
        if (curProj && curProj.files[activeFile] !== undefined) {
          curProj.files[activeFile] = editor.getValue();
          clearTimeout(autoSaveTimer);
          autoSaveTimer = setTimeout(() => {
            projectManager.saveActiveProjectFiles(curProj.files, curProj.mcu);
          }, 400);
        }
      });

      // Shortcut: Ctrl + Enter to compile
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        compileFirmware();
      });

      // Shortcut: Ctrl + S to save
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        const curProj = projectManager.getActiveProject();
        projectManager.saveActiveProjectFiles(curProj.files, curProj.mcu);
        addLog(0, `💾 Project "${curProj.name}" saved to browser storage.`, "success");
      });

      resolve();
    });
  });
}

function getLanguageForFile(filename) {
  if (filename.endsWith(".c") || filename.endsWith(".h")) return "c";
  if (filename.endsWith(".ld")) return "plaintext";
  if (filename.endsWith(".s") || filename.endsWith(".S")) return "plaintext";
  if (filename.endsWith(".json")) return "json";
  return "plaintext";
}

// 2. Activity Bar View Switching
document.querySelectorAll(".activity-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".activity-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const targetSidebar = btn.getAttribute("data-sidebar");
    document.querySelectorAll(".sidebar-view").forEach((view) => {
      view.style.display = "none";
    });

    const activeView = document.getElementById(`view-${targetSidebar}`);
    if (activeView) {
      activeView.style.display = "flex";
      activeView.style.flexDirection = "column";
      sidebar.classList.remove("collapsed");
    }

    if (targetSidebar === "projects") {
      renderSavedProjectsList();
    } else if (targetSidebar === "examples") {
      renderExamplesCatalogue();
    } else if (targetSidebar === "explorer") {
      renderProjectExplorer();
    }
  });
});

// 3. Project Explorer: Render ONLY files of the active project
function renderProjectExplorer() {
  const proj = projectManager.getActiveProject();
  if (!proj) return;

  topbarProjectName.textContent = proj.name;
  explorerProjectName.textContent = proj.name;
  explorerMcuBadge.textContent = proj.mcu.toUpperCase();
  breadcrumbProject.textContent = proj.name;
  statusProjectName.textContent = proj.name;

  if (mcuSelect.value !== proj.mcu) {
    mcuSelect.value = proj.mcu;
    updateMcuProfileSpecs();
  }

  let html = "";
  for (const fname of Object.keys(proj.files)) {
    const isAct = fname === activeFile;
    let iconClass = "icon-c fa-file-code";
    if (fname.endsWith(".h")) iconClass = "icon-h fa-file-code";
    else if (fname.endsWith(".ld")) iconClass = "icon-ld fa-file-lines";
    else if (fname.endsWith(".s") || fname.endsWith(".S")) iconClass = "icon-s fa-file-lines";

    const canDelete = fname !== "main.c" && fname !== "funconfig.h" && fname !== "ch32fun.ld";

    html += `
      <div class="tree-item ${isAct ? "active" : ""}" data-file="${fname}">
        <div class="tree-item-main">
          <i class="fa-solid ${iconClass}"></i>
          <span>${fname}</span>
        </div>
        ${
          canDelete
            ? `<button class="file-delete-btn" data-delete-file="${fname}" title="Delete ${fname}"><i class="fa-solid fa-trash-can"></i></button>`
            : ""
        }
      </div>
    `;
  }
  projectFilesContainer.innerHTML = html;

  // Click on file to switch editor tab
  projectFilesContainer.querySelectorAll(".tree-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".file-delete-btn")) return;
      const file = item.getAttribute("data-file");
      switchToFile(file);
    });
  });

  // Delete file action
  projectFilesContainer.querySelectorAll(".file-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const fname = btn.getAttribute("data-delete-file");
      if (confirm(`Delete file "${fname}" from project?`)) {
        try {
          projectManager.deleteFileFromActiveProject(fname);
          if (activeFile === fname) switchToFile("main.c");
          renderProjectExplorer();
          renderTabs();
        } catch (err) {
          alert(err.message);
        }
      }
    });
  });

  renderTabs();
}

// 4. Editor Tabs & File Switching
function renderTabs() {
  const proj = projectManager.getActiveProject();
  if (!proj) return;

  const files = Object.keys(proj.files);
  let html = "";
  files.forEach((f) => {
    const isAct = f === activeFile;
    let icon = "fa-file-code icon-c";
    if (f.endsWith(".h")) icon = "fa-file-code icon-h";
    else if (f.endsWith(".ld")) icon = "fa-file-lines icon-ld";

    html += `
      <div class="tab ${isAct ? "active" : ""}" data-file="${f}">
        <i class="fa-solid ${icon}"></i>
        <span>${f}</span>
      </div>
    `;
  });
  editorTabs.innerHTML = html;

  editorTabs.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const f = tab.getAttribute("data-file");
      switchToFile(f);
    });
  });
}

function switchToFile(filename) {
  const proj = projectManager.getActiveProject();
  if (!proj || proj.files[filename] === undefined) return;

  // Save current open file before switching
  if (editor && proj.files[activeFile] !== undefined) {
    proj.files[activeFile] = editor.getValue();
    projectManager.saveActiveProjectFiles(proj.files, proj.mcu);
  }

  activeFile = filename;
  breadcrumbCurrentFile.textContent = filename;

  if (editor) {
    editor.setValue(proj.files[filename]);
    const lang = getLanguageForFile(filename);
    monaco.editor.setModelLanguage(editor.getModel(), lang);
  }

  renderProjectExplorer();
}

// 5. Examples Catalogue: Categorized Accordion View
function renderExamplesCatalogue() {
  const query = (exampleSearchInput ? exampleSearchInput.value : "").trim().toLowerCase();
  const filterMcu = examplesMcuFilter ? examplesMcuFilter.value : "all";

  const filtered = EXAMPLES_CATALOGUE.filter((ex) => {
    const matchesSearch =
      !query ||
      ex.name.toLowerCase().includes(query) ||
      ex.title.toLowerCase().includes(query) ||
      ex.description.toLowerCase().includes(query) ||
      ex.category.toLowerCase().includes(query);

    const matchesMcu =
      filterMcu === "all" || ex.mcus.includes("all") || ex.mcus.includes(filterMcu);

    return matchesSearch && matchesMcu;
  });

  if (examplesTotalCount) {
    examplesTotalCount.textContent = `${filtered.length}`;
  }

  // Group by category
  const categories = {};
  filtered.forEach((ex) => {
    if (!categories[ex.category]) categories[ex.category] = [];
    categories[ex.category].push(ex);
  });

  let html = "";
  for (const [catName, items] of Object.entries(categories)) {
    html += `
      <div class="tree-folder">
        <div class="tree-folder-title">
          <i class="fa-solid fa-chevron-down"></i>
          <i class="fa-regular fa-folder-open folder-icon"></i>
          <span>${catName}</span>
          <span class="chip-pill" style="margin-left: auto;">${items.length}</span>
        </div>
        <div class="tree-folder-children">
          ${items
            .map(
              (ex) => `
            <div class="example-item-card" data-example-id="${ex.id}">
              <div class="example-card-header">
                <div class="example-card-title">
                  <i class="fa-solid fa-file-code icon-c"></i>
                  <span>${ex.name}</span>
                </div>
                <button class="btn-example-clone" data-clone-id="${ex.id}" title="${t("clone_as_project")}">
                  <i class="fa-solid fa-plus"></i> ${t("clone_as_project")}
                </button>
              </div>
              <div class="example-card-desc">${ex.description}</div>
              <div class="example-card-footer">
                <div class="chip-pills">
                  ${ex.mcus.map((m) => `<span class="chip-pill">${m.toUpperCase()}</span>`).join("")}
                </div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  if (filtered.length === 0) {
    html = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No matching examples found for "${query}".</div>`;
  }

  examplesListContainer.innerHTML = html;

  // Toggle folder collapse
  examplesListContainer.querySelectorAll(".tree-folder-title").forEach((header) => {
    header.addEventListener("click", () => {
      header.closest(".tree-folder").classList.toggle("collapsed");
    });
  });

  // Open example in editor for preview
  examplesListContainer.querySelectorAll(".example-item-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".btn-example-clone")) return;
      const exId = card.getAttribute("data-example-id");
      const ex = EXAMPLES_CATALOGUE.find((x) => x.id === exId);
      if (ex && editor) {
        editor.setValue(ex.code);
        addLog(0, `📖 Previewing example "${ex.name}". You can create a new project from it using "Create Project".`, "info");
      }
    });
  });

  // Create Project from Example
  examplesListContainer.querySelectorAll(".btn-example-clone").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const exId = btn.getAttribute("data-clone-id");
      try {
        const newProj = projectManager.createProjectFromExample(exId);
        activeFile = "main.c";
        document.querySelector('.activity-btn[data-sidebar="explorer"]').click();
        renderProjectExplorer();
        switchToFile("main.c");
        addLog(0, `✨ Project "${newProj.name}" created from example "${exId}".`, "success");
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

if (exampleSearchInput) {
  exampleSearchInput.addEventListener("input", renderExamplesCatalogue);
}
if (examplesMcuFilter) {
  examplesMcuFilter.addEventListener("change", renderExamplesCatalogue);
}

// 6. Saved Projects Manager: Browser Storage List
function renderSavedProjectsList() {
  const projects = projectManager.getProjects();
  const activeProj = projectManager.getActiveProject();

  let html = "";
  projects.forEach((proj) => {
    const isAct = proj.id === activeProj.id;
    const fileCount = Object.keys(proj.files).length;
    const dateStr = new Date(proj.updatedAt || proj.createdAt).toLocaleString();

    html += `
      <div class="project-card ${isAct ? "active" : ""}" data-proj-id="${proj.id}">
        <div class="proj-card-top">
          <div class="proj-card-title">${proj.name}</div>
          <span class="chip-pill" style="${isAct ? "background: var(--accent); color: white;" : ""}">${proj.mcu.toUpperCase()}</span>
        </div>
        <div class="proj-card-meta">
          <span><i class="fa-solid fa-clock"></i> ${dateStr}</span>
          <span><i class="fa-solid fa-file"></i> ${fileCount} files</span>
        </div>
        <div class="proj-card-actions">
          ${
            !isAct
              ? `<button class="proj-action-btn btn-open-proj" data-id="${proj.id}"><i class="fa-solid fa-folder-open"></i> Abrir</button>`
              : `<span class="chip-pill" style="color: var(--accent);"><i class="fa-solid fa-check"></i> Activo</span>`
          }
          <button class="proj-action-btn btn-zip-proj" data-id="${proj.id}"><i class="fa-solid fa-file-zipper"></i> ZIP</button>
          <button class="proj-action-btn danger btn-del-proj" data-id="${proj.id}" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
    `;
  });
  savedProjectsListContainer.innerHTML = html;

  // Open Project
  savedProjectsListContainer.querySelectorAll(".btn-open-proj").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      projectManager.switchProject(id);
      activeFile = "main.c";
      document.querySelector('.activity-btn[data-sidebar="explorer"]').click();
      renderProjectExplorer();
      switchToFile("main.c");
    });
  });

  // ZIP Export
  savedProjectsListContainer.querySelectorAll(".btn-zip-proj").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      projectManager.exportProjectAsZip(id);
    });
  });

  // Delete Project
  savedProjectsListContainer.querySelectorAll(".btn-del-proj").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const proj = projectManager.getProject(id);
      if (confirm(`Are you sure you want to delete project "${proj.name}"? This action cannot be undone.`)) {
        try {
          projectManager.deleteProject(id);
          renderSavedProjectsList();
          renderProjectExplorer();
          switchToFile("main.c");
        } catch (err) {
          alert(err.message);
        }
      }
    });
  });
}

// 7. Modals: New Project & New File
topbarProjectBtn.addEventListener("click", () => {
  document.querySelector('.activity-btn[data-sidebar="projects"]').click();
});

btnOpenNewProjectModal.addEventListener("click", () => {
  newProjectModal.style.display = "flex";
  newProjectNameInput.value = `CH32 Project ${projectManager.getProjects().length + 1}`;
  newProjectNameInput.focus();
});

closeNewProjectModalBtn.addEventListener("click", () => (newProjectModal.style.display = "none"));
cancelNewProjectModalBtn.addEventListener("click", () => (newProjectModal.style.display = "none"));

confirmCreateProjectBtn.addEventListener("click", () => {
  const name = newProjectNameInput.value.trim() || "New Project";
  const mcu = newProjectMcuSelect.value;
  const tmplKey = newProjectTemplateSelect.value;

  let tmplCode = BLANK_TEMPLATE;
  if (tmplKey !== "blank") {
    const foundEx = EXAMPLES_CATALOGUE.find((x) => x.id === tmplKey);
    if (foundEx) tmplCode = foundEx.code;
  }

  const newProj = projectManager.createProject(name, mcu, tmplCode);
  newProjectModal.style.display = "none";
  activeFile = "main.c";
  document.querySelector('.activity-btn[data-sidebar="explorer"]').click();
  renderProjectExplorer();
  switchToFile("main.c");
  addLog(0, `✨ Project "${newProj.name}" created successfully (${mcu.toUpperCase()}).`, "success");
});

// New File Modal
btnNewFile.addEventListener("click", () => {
  newFileModal.style.display = "flex";
  newFileNameInput.value = "";
  newFileNameInput.focus();
});

closeNewFileModalBtn.addEventListener("click", () => (newFileModal.style.display = "none"));
cancelNewFileModalBtn.addEventListener("click", () => (newFileModal.style.display = "none"));

confirmCreateFileBtn.addEventListener("click", () => {
  const fname = newFileNameInput.value.trim();
  if (!fname) return;

  try {
    let initialContent = "// " + fname + "\n";
    if (fname.endsWith(".h")) {
      const guard = "_" + fname.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase() + "_";
      initialContent = `#ifndef ${guard}\n#define ${guard}\n\n#endif\n`;
    }
    projectManager.addFileToActiveProject(fname, initialContent);
    newFileModal.style.display = "none";
    renderProjectExplorer();
    switchToFile(fname);
  } catch (err) {
    alert(err.message);
  }
});

btnExportZip.addEventListener("click", () => {
  projectManager.exportProjectAsZip();
});

// 8. Theme & Language Controls
function applyTheme(themeKey) {
  const theme = THEMES[themeKey];
  if (!theme) return;

  const root = document.documentElement;
  Object.entries(theme.ui).forEach(([prop, val]) => {
    root.style.setProperty(prop, val);
  });

  if (editor && window.monaco) {
    monaco.editor.setTheme(theme.editorTheme);
  }

  localStorage.setItem("funstudio_theme", themeKey);
}

themeSelect.addEventListener("change", (e) => applyTheme(e.target.value));

langSelect.addEventListener("change", (e) => {
  setLanguage(e.target.value);
  updateMcuProfileSpecs();
});

// 9. Hardware Profile Updates
function updateMcuProfileSpecs() {
  const mcuId = mcuSelect.value;
  const profile = MCU_PROFILES[mcuId] || MCU_PROFILES.ch32v003;

  document.getElementById("specCore").textContent = profile.core;
  document.getElementById("specClock").textContent = profile.clock;
  document.getElementById("specSram").textContent = profile.sram;
  document.getElementById("specFlash").textContent = profile.flash;
  document.getElementById("specPeriph").textContent = profile.periph;

  topChipBadge.innerHTML = `<i class="fa-solid fa-bolt"></i> ${profile.name.replace("WCH ", "")}`;
  topArchBadge.innerHTML = `<i class="fa-solid fa-code"></i> ${profile.arch.toUpperCase()}`;
  statusTarget.textContent = `${mcuId.toUpperCase()} (${profile.arch})`;

  archSelect.value = profile.arch;

  // Sync to current active project
  const curProj = projectManager.getActiveProject();
  if (curProj && curProj.mcu !== mcuId) {
    curProj.mcu = mcuId;
    projectManager.saveActiveProjectFiles(curProj.files, mcuId);
    explorerMcuBadge.textContent = mcuId.toUpperCase();
  }
}

mcuSelect.addEventListener("change", updateMcuProfileSpecs);

optSelect.addEventListener("change", () => {
  topOptBadge.innerHTML = `<i class="fa-solid fa-gauge-high"></i> ${optSelect.value}`;
});

archSelect.addEventListener("change", () => {
  topArchBadge.innerHTML = `<i class="fa-solid fa-code"></i> ${archSelect.value.toUpperCase()}`;
});

// 10. Logging & Terminal Output
function addLog(step, message, level = "info", timestamp = null) {
  const time = timestamp || new Date().toLocaleTimeString();
  let stepTag = "[SYSTEM]";
  if (step === 1) stepTag = "[CC1]";
  else if (step === 2) stepTag = "[AS]";
  else if (step === 3) stepTag = "[LD]";
  else if (step === 4) stepTag = "[OBJDUMP]";
  else if (step === 5) stepTag = "[SIZE]";
  else if (step === 6) stepTag = "[OBJCOPY]";

  const row = document.createElement("div");
  row.className = "log-line";
  row.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="log-step">${stepTag}</span>
    <span class="log-msg ${level}">${escapeHtml(message)}</span>
  `;
  terminalOutput.appendChild(row);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

clearTerminalBtn.addEventListener("click", () => {
  terminalOutput.innerHTML = "";
});

// Panel Tab Navigation
document.querySelectorAll(".panel-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".panel-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    const targetId = tab.getAttribute("data-target");
    document.querySelectorAll(".panel-view").forEach((view) => {
      view.style.display = "none";
    });

    const targetView = document.getElementById(targetId);
    if (targetView) targetView.style.display = "block";
  });
});

toggleSidebarBtn.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
});

togglePanelBtn.addEventListener("click", () => {
  bottomPanel.style.display = bottomPanel.style.display === "none" ? "flex" : "none";
});

closePanelBtn.addEventListener("click", () => {
  bottomPanel.style.display = "none";
});

// 11. 100% Genuine On-The-Fly Compilation Pipeline
async function compileFirmware() {
  if (currentWorker) {
    currentWorker.terminate();
  }

  const curProj = projectManager.getActiveProject();
  if (editor && curProj && curProj.files[activeFile] !== undefined) {
    curProj.files[activeFile] = editor.getValue();
    projectManager.saveActiveProjectFiles(curProj.files, curProj.mcu);
  }

  compileBtn.disabled = true;
  compileBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>${t("btn_compiling")}</span>`;
  buildProgress.style.width = "10%";
  statusState.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>${t("status_compiling")}</span>`;

  bottomPanel.style.display = "flex";
  document.querySelector('.panel-tab[data-target="panel-terminal"]').click();

  const profile = MCU_PROFILES[curProj.mcu] || MCU_PROFILES.ch32v003;
  addLog(0, `=== FunStudio Web IDE | GNU GCC 15.2.0 Compiler (WebAssembly) ===`, "info");
  addLog(0, `Project: "${curProj.name}" | Target: ${curProj.mcu.toUpperCase()} | ISA: ${profile.arch} | Opt: ${optSelect.value}`, "info");

  currentWorker = new Worker(new URL("./compiler-worker.js", import.meta.url), { type: "module" });

  let compilerStdErr = "";

  currentWorker.onmessage = (e) => {
    const data = e.data;

    if (data.type === "log") {
      addLog(data.step, data.message, data.level, data.timestamp);
      if (data.level === "warn" || data.level === "error") {
        compilerStdErr += data.message + "\n";
      }
    } else if (data.type === "progress") {
      buildProgress.style.width = `${data.percent}%`;
    } else if (data.type === "success") {
      compileBtn.disabled = false;
      compileBtn.innerHTML = `<i class="fa-solid fa-play"></i> <span>${t("btn_compile")}</span>`;
      buildProgress.style.width = "100%";
      statusState.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #4ec9b0;"></i> <span>${t("status_success")}</span>`;
      statusTime.style.display = "flex";
      statusTimeVal.textContent = data.stats.time;

      diagnosticsList = parseGccDiagnostics(compilerStdErr);
      applyCompilerDiagnostics();

      compiledArtifacts = data;
      renderDisassembly(data.disasm || data.asm);
      renderHexDump(data.hex);
      renderMemoryAnalysis(data.stats, profile);

      setTimeout(() => {
        buildProgress.style.width = "0%";
      }, 1500);
    } else if (data.type === "error") {
      compileBtn.disabled = false;
      compileBtn.innerHTML = `<i class="fa-solid fa-play"></i> <span>${t("btn_compile")}</span>`;
      buildProgress.style.width = "0%";
      statusState.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #f48771;"></i> <span>${t("status_error")}</span>`;

      compilerStdErr += data.error + "\n";
      diagnosticsList = parseGccDiagnostics(compilerStdErr);
      if (diagnosticsList.length === 0) {
        diagnosticsList.push({
          line: 1,
          col: 1,
          severity: "error",
          message: data.error,
        });
      }
      applyCompilerDiagnostics();

      document.querySelector('.panel-tab[data-target="panel-problems"]').click();
      addLog(0, `${t("status_error")}: ${data.error}`, "error");
    }
  };

  if (curProj && curProj.files && activeFile) {
    curProj.files[activeFile] = editor.getValue();
  }

  currentWorker.postMessage({
    code: curProj.files["main.c"] || editor.getValue(),
    files: curProj.files,
    mcu: curProj.mcu,
    arch: archSelect.value || profile.arch,
    abi: profile.abi || "ilp32",
    optLevel: optSelect.value,
    target: "riscv32-unknown-elf",
    linkerScript: curProj.files["ch32fun.ld"] || null,
  });
}

compileBtn.addEventListener("click", compileFirmware);

cleanBtn.addEventListener("click", () => {
  terminalOutput.innerHTML = "";
  compiledArtifacts = null;
  document.getElementById("disassemblyOutput").textContent = "";
  document.getElementById("hexDumpOutput").textContent = "";
  statusTime.style.display = "none";
  addLog(0, "Build artifacts and compilation logs cleared.", "info");
});

// 12. Diagnostics & Monaco Markers
function parseGccDiagnostics(rawOutput) {
  const diags = [];
  const lines = rawOutput.split("\n");
  const regex = /:(\d+):(\d+):\s+(error|warning):\s+(.+)/;

  lines.forEach((line) => {
    const match = line.match(regex);
    if (match) {
      diags.push({
        line: parseInt(match[1], 10),
        col: parseInt(match[2], 10),
        severity: match[3],
        message: match[4],
      });
    }
  });
  return diags;
}

function applyCompilerDiagnostics() {
  if (!editor || !window.monaco) return;

  const markers = diagnosticsList.map((d) => ({
    startLineNumber: d.line,
    startColumn: d.col,
    endLineNumber: d.line,
    endColumn: d.col + 5,
    message: d.message,
    severity:
      d.severity === "error"
        ? monaco.MarkerSeverity.Error
        : monaco.MarkerSeverity.Warning,
  }));

  monaco.editor.setModelMarkers(editor.getModel(), "gcc", markers);

  if (diagnosticsList.length > 0) {
    problemCountBadge.style.display = "inline-block";
    problemCountBadge.textContent = diagnosticsList.length;

    let phtml = "";
    diagnosticsList.forEach((d) => {
      const color = d.severity === "error" ? "var(--accent-orange)" : "var(--accent-yellow)";
      const icon = d.severity === "error" ? "fa-circle-xmark" : "fa-triangle-exclamation";
      phtml += `
        <div style="padding: 4px 0; display: flex; gap: 8px; cursor: pointer;" onclick="window.goToLine(${d.line}, ${d.col})">
          <i class="fa-solid ${icon}" style="color: ${color}; margin-top: 3px;"></i>
          <div>
            <strong>[Ln ${d.line}, Col ${d.col}]</strong> ${escapeHtml(d.message)}
          </div>
        </div>
      `;
    });
    problemsList.innerHTML = phtml;
  } else {
    problemCountBadge.style.display = "none";
    problemsList.innerHTML = `<span data-i18n="no_problems">${t("no_problems")}</span>`;
  }
}

window.goToLine = (line, col) => {
  if (editor) {
    editor.revealPositionInCenter({ lineNumber: line, column: col });
    editor.setPosition({ lineNumber: line, column: col });
    editor.focus();
  }
};

// 13. Output Renderers: Disassembly, Memory Footprint & HEX
function renderDisassembly(rawDisasm) {
  const container = document.getElementById("disassemblyOutput");
  if (!rawDisasm) {
    container.innerHTML = `<div style="color: var(--text-muted);">${t("tab_disasm")}</div>`;
    return;
  }

  const lines = rawDisasm.split("\n");
  let html = "";
  const instrRegex = /^\s*([0-9a-f]+):\s+([0-9a-f]+)\s+([a-z0-9.]+)\s*(.*)/i;

  lines.forEach((line) => {
    const match = line.match(instrRegex);
    if (match) {
      const addr = match[1];
      const hex = match[2];
      const inst = match[3];
      const args = match[4];
      html += `
        <div class="asm-row">
          <span class="asm-addr">${addr}:</span>
          <span class="asm-hex">${hex}</span>
          <span class="asm-inst">${inst}</span>
          <span class="asm-args">${escapeHtml(args)}</span>
        </div>
      `;
    } else {
      html += `<div style="color: var(--text-muted);">${escapeHtml(line)}</div>`;
    }
  });

  container.innerHTML = html;
}

function renderHexDump(hexContent) {
  const container = document.getElementById("hexDumpOutput");
  container.textContent = hexContent || "Intel HEX output unavailable.";
}

function renderMemoryAnalysis(stats, profile) {
  if (!stats) return;

  const totalFlash = profile.flashBytes;
  const totalSram = profile.sramBytes;

  const usedFlash = stats.flashBytes;
  const usedSram = stats.ramBytes;

  const flashPct = Math.min(100, ((usedFlash / totalFlash) * 100)).toFixed(1);
  const sramPct = Math.min(100, ((usedSram / totalSram) * 100)).toFixed(1);

  document.getElementById("flashPercentText").textContent = `${flashPct}%`;
  document.getElementById("flashBar").style.width = `${flashPct}%`;
  document.getElementById("flashUsedBytes").textContent = `${usedFlash.toLocaleString()} Bytes used`;
  document.getElementById("flashTotalBytes").textContent = `of ${profile.flash}`;

  document.getElementById("sramPercentText").textContent = `${sramPct}%`;
  document.getElementById("sramBar").style.width = `${sramPct}%`;
  document.getElementById("sramUsedBytes").textContent = `${usedSram.toLocaleString()} Bytes used`;
  document.getElementById("sramTotalBytes").textContent = `of ${profile.sram}`;

  document.getElementById("secTextSize").textContent = `${usedFlash} B`;
  document.getElementById("secDataSize").textContent = `${usedSram} B`;
}

// 14. Downloads & Artifact Exports
downloadBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  downloadModal.style.display = downloadModal.style.display === "none" ? "block" : "none";
});

document.addEventListener("click", () => {
  downloadModal.style.display = "none";
});

downloadModal.addEventListener("click", (e) => e.stopPropagation());

function triggerFileDownload(blobOrBytes, filename, mimeType = "application/octet-stream") {
  const blob = blobOrBytes instanceof Blob ? blobOrBytes : new Blob([blobOrBytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.getElementById("dlOptionZip").addEventListener("click", () => {
  projectManager.exportProjectAsZip();
  downloadModal.style.display = "none";
});

document.getElementById("dlOptionElf").addEventListener("click", () => {
  if (!compiledArtifacts || !compiledArtifacts.elf) {
    alert(t("dl_alert_empty"));
    return;
  }
  const curProj = projectManager.getActiveProject();
  triggerFileDownload(compiledArtifacts.elf, `${curProj.name}.elf`);
  downloadModal.style.display = "none";
});

document.getElementById("dlOptionHex").addEventListener("click", () => {
  if (!compiledArtifacts || !compiledArtifacts.hex) {
    alert(t("dl_alert_empty"));
    return;
  }
  const curProj = projectManager.getActiveProject();
  triggerFileDownload(compiledArtifacts.hex, `${curProj.name}.hex`, "text/plain");
  downloadModal.style.display = "none";
});

document.getElementById("dlOptionBin").addEventListener("click", () => {
  if (!compiledArtifacts || !compiledArtifacts.bin) {
    alert(t("dl_alert_empty"));
    return;
  }
  const curProj = projectManager.getActiveProject();
  triggerFileDownload(compiledArtifacts.bin, `${curProj.name}.bin`);
  downloadModal.style.display = "none";
});

document.getElementById("dlOptionAsm").addEventListener("click", () => {
  if (!compiledArtifacts || !compiledArtifacts.asm) {
    alert(t("dl_alert_empty"));
    return;
  }
  const curProj = projectManager.getActiveProject();
  triggerFileDownload(compiledArtifacts.asm, `${curProj.name}.s`, "text/plain");
  downloadModal.style.display = "none";
});

// 15. Initial Bootstrapping
window.addEventListener("DOMContentLoaded", async () => {
  const savedTheme = localStorage.getItem("funstudio_theme") || "vs-dark";
  themeSelect.value = savedTheme;
  applyTheme(savedTheme);

  const savedLang = getLanguage();
  langSelect.value = savedLang;
  applyTranslations();

  await initMonaco();

  renderProjectExplorer();
  updateMcuProfileSpecs();
  renderExamplesCatalogue();
  renderSavedProjectsList();
});
