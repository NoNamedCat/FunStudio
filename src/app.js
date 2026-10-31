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
import {
  pairDevice, flashToBoard, bootBoard, closeBoard, isFlashing,
} from "./flasher/webhid.js";

// State
const projectManager = new ProjectManager();
let editor = null;
let currentWorker = null;
let compiledArtifacts = null;
let openFiles = ["main.c"];
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
          const delIdx = openFiles.indexOf(fname);
          if (delIdx !== -1) openFiles.splice(delIdx, 1);
          if (activeFile === fname) {
            const next = openFiles[0] || "main.c";
            switchToFile(next);
          } else {
            renderProjectExplorer();
            renderTabs();
          }
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

  // Filter openFiles to only include files that actually exist in the active project
  openFiles = openFiles.filter((f) => proj.files[f] !== undefined);
  if (openFiles.length === 0) {
    const fallback = proj.files["main.c"] !== undefined ? "main.c" : Object.keys(proj.files)[0];
    if (fallback) openFiles = [fallback];
  }

  // Ensure activeFile is in openFiles
  if (!openFiles.includes(activeFile)) {
    activeFile = openFiles[0] || "main.c";
  }

  let html = "";
  openFiles.forEach((f) => {
    const isAct = f === activeFile;
    let icon = "fa-file-code icon-c";
    if (f.endsWith(".h")) icon = "fa-file-code icon-h";
    else if (f.endsWith(".ld")) icon = "fa-file-lines icon-ld";
    else if (f.endsWith(".s") || f.endsWith(".S")) icon = "fa-file-lines icon-s";

    html += `
      <div class="tab ${isAct ? "active" : ""}" data-file="${escapeHtml(f)}">
        <i class="fa-solid ${icon}"></i>
        <span>${escapeHtml(f)}</span>
        <span class="tab-close" data-close-file="${escapeHtml(f)}" title="Close">
          <i class="fa-solid fa-xmark"></i>
        </span>
      </div>
    `;
  });
  editorTabs.innerHTML = html;

  editorTabs.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      if (e.target.closest(".tab-close")) return;
      const f = tab.getAttribute("data-file");
      switchToFile(f);
    });
  });

  editorTabs.querySelectorAll(".tab-close").forEach((closeBtn) => {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const f = closeBtn.getAttribute("data-close-file");
      closeFileTab(f);
    });
  });
}

function closeFileTab(filename) {
  const proj = projectManager.getActiveProject();
  if (!proj) return;

  // Save if closing active file
  if (editor && activeFile === filename && proj.files[filename] !== undefined) {
    proj.files[filename] = editor.getValue();
    projectManager.saveActiveProjectFiles(proj.files, proj.mcu);
  }

  const idx = openFiles.indexOf(filename);
  if (idx !== -1) {
    openFiles.splice(idx, 1);
  }

  if (activeFile === filename) {
    if (openFiles.length > 0) {
      const nextFile = openFiles[Math.max(0, idx - 1)] || openFiles[0];
      switchToFile(nextFile);
    } else {
      const fallback = proj.files["main.c"] !== undefined ? "main.c" : Object.keys(proj.files)[0];
      if (fallback) {
        openFiles = [fallback];
        switchToFile(fallback);
      }
    }
  } else {
    renderTabs();
  }
}

function switchToFile(filename) {
  const proj = projectManager.getActiveProject();
  if (!proj || proj.files[filename] === undefined) return;

  // Save current open file before switching
  if (editor && proj.files[activeFile] !== undefined) {
    proj.files[activeFile] = editor.getValue();
    projectManager.saveActiveProjectFiles(proj.files, proj.mcu);
  }

  if (!openFiles.includes(filename)) {
    openFiles.push(filename);
  }

  activeFile = filename;
  breadcrumbCurrentFile.textContent = filename;

  if (editor) {
    editor.setValue(proj.files[filename]);
    const lang = getLanguageForFile(filename);
    monaco.editor.setModelLanguage(editor.getModel(), lang);
  }

  renderProjectExplorer();
  renderTabs();
}

// Open EVERY file of the (now active) project as a tab and activate main.c.
// Used right after creating/switching to a project: the previous project's
// tabs are all closed, the new project's files are all opened, and main.c is
// shown. activeFile is set to a sentinel (not a real file) so switchToFile's
// "save the file we're leaving" step is a no-op — the whole previous project
// was abandoned, not a single file of it — which also prevents the stale
// editor content from overwriting the freshly-loaded main.c.
function openProjectFiles() {
  const proj = projectManager.getActiveProject();
  if (!proj) return;
  openFiles = Object.keys(proj.files);
  activeFile = "";
  const target = proj.files["main.c"] !== undefined ? "main.c" : openFiles[0];
  switchToFile(target);
}

// 5. Examples Catalogue: Categorized Accordion View
const expandedCategories = new Set();

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

  const activeProj = projectManager.getActiveProject();

  let html = "";
  for (const [catName, items] of Object.entries(categories)) {
    // Only expand if there is an active search query matching items or if explicitly expanded by user
    const isExpanded = query.length > 0 ? true : expandedCategories.has(catName);

    html += `
      <div class="tree-folder ${isExpanded ? "" : "collapsed"}" data-cat="${escapeHtml(catName)}">
        <div class="tree-folder-title">
          <i class="fa-solid fa-chevron-down"></i>
          <i class="fa-regular ${isExpanded ? "fa-folder-open" : "fa-folder"} folder-icon"></i>
          <span>${escapeHtml(catName)}</span>
          <span class="chip-pill" style="margin-left: auto;">${items.length}</span>
        </div>
        <div class="tree-folder-children">
          ${items
            .map((ex) => {
              const isActive = activeProj && (activeProj.exampleId === ex.id || activeProj.name === ex.name.replace(/\.c$/, ""));
              return `
            <div class="example-item-card ${isActive ? "active-example" : ""}" data-example-id="${ex.id}">
              <div class="example-card-header">
                <div class="example-card-title">
                  <i class="fa-solid fa-file-code icon-c"></i>
                  <span>${escapeHtml(ex.name)}</span>
                  ${isActive ? `<span class="chip-pill" style="background: rgba(78, 201, 176, 0.2); color: #4ec9b0; font-weight: 700; margin-left: 6px;">${t("active_badge") || "ACTIVE"}</span>` : ""}
                </div>
                <button class="btn-example-clone" data-clone-id="${ex.id}" title="${t("open_example") || "Open Example"}">
                  <i class="fa-solid ${isActive ? "fa-check" : "fa-folder-open"}"></i> ${isActive ? (t("active_badge") || "ACTIVE") : (t("open_example") || "Open")}
                </button>
              </div>
              <div class="example-card-desc">${escapeHtml(ex.description)}</div>
              <div class="example-card-footer">
                <div class="chip-pills">
                  ${ex.mcus.map((m) => `<span class="chip-pill">${m.toUpperCase()}</span>`).join("")}
                </div>
              </div>
            </div>
          `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  if (filtered.length === 0) {
    html = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No matching examples found for "${escapeHtml(query)}".</div>`;
  }

  examplesListContainer.innerHTML = html;

  // Toggle folder collapse
  examplesListContainer.querySelectorAll(".tree-folder-title").forEach((header) => {
    header.addEventListener("click", () => {
      const folder = header.closest(".tree-folder");
      const cat = folder.getAttribute("data-cat");
      folder.classList.toggle("collapsed");
      const isNowCollapsed = folder.classList.contains("collapsed");
      if (isNowCollapsed) {
        expandedCategories.delete(cat);
      } else {
        expandedCategories.add(cat);
      }
      const icon = header.querySelector(".folder-icon");
      if (icon) {
        icon.className = `fa-regular ${isNowCollapsed ? "fa-folder" : "fa-folder-open"} folder-icon`;
      }
    });
  });

  // Open example in editor and activate it as current project
  examplesListContainer.querySelectorAll(".example-item-card").forEach((card) => {
    card.addEventListener("click", () => {
      const exId = card.getAttribute("data-example-id");
      openExample(exId);
    });
  });

  examplesListContainer.querySelectorAll(".btn-example-clone").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const exId = btn.getAttribute("data-clone-id");
      openExample(exId);
    });
  });
}

function openExample(exId) {
  const ex = EXAMPLES_CATALOGUE.find((x) => x.id === exId);
  if (!ex) return;

  // Save current active project file if modified before switching
  const cur = projectManager.getActiveProject();
  if (editor && cur && cur.files[activeFile] !== undefined) {
    cur.files[activeFile] = editor.getValue();
    projectManager.saveActiveProjectFiles(cur.files, cur.mcu);
  }

  const proj = projectManager.openExampleAsProject(exId);

  renderProjectExplorer();
  openProjectFiles();
  renderSavedProjectsList();
  renderExamplesCatalogue();

  addLog(0, `✓ Project "${proj.name}" loaded (${proj.mcu.toUpperCase()}). Ready to compile.`, "info");
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

      // Save current file before switching
      const cur = projectManager.getActiveProject();
      if (editor && cur && cur.files[activeFile] !== undefined) {
        cur.files[activeFile] = editor.getValue();
        projectManager.saveActiveProjectFiles(cur.files, cur.mcu);
      }

      projectManager.switchProject(id);

      document.querySelector('.activity-btn[data-sidebar="explorer"]').click();
      renderProjectExplorer();
      openProjectFiles();
      renderSavedProjectsList();
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

  // Save the current editor content to the project being left before abandoning it.
  const cur = projectManager.getActiveProject();
  if (editor && cur && cur.files[activeFile] !== undefined) {
    cur.files[activeFile] = editor.getValue();
    projectManager.saveActiveProjectFiles(cur.files, cur.mcu);
  }

  const newProj = projectManager.createProject(name, mcu, tmplCode);
  newProjectModal.style.display = "none";

  document.querySelector('.activity-btn[data-sidebar="explorer"]').click();
  renderProjectExplorer();
  openProjectFiles();
  renderSavedProjectsList();
  renderExamplesCatalogue();
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

// Copy the content of the active bottom panel tab to the clipboard
const copyPanelBtn = document.getElementById("copyPanelBtn");
if (copyPanelBtn) {
  copyPanelBtn.addEventListener("click", () => {
    const activeTab = document.querySelector(".panel-tab.active");
    const targetId = activeTab ? activeTab.getAttribute("data-target") : "panel-terminal";
    let text = "";
    if (targetId === "panel-disasm" && typeof compiledArtifacts !== "undefined" && compiledArtifacts && compiledArtifacts.disasm) {
      text = compiledArtifacts.disasm;
    } else if (targetId === "panel-terminal") {
      text = Array.from(terminalOutput.querySelectorAll(".log-line"))
        .map((line) => Array.from(line.children).map((c) => c.textContent.trim()).filter(Boolean).join(" "))
        .join("\n");
    } else {
      const view = document.getElementById(targetId);
      if (view) {
        const clone = view.cloneNode(true);
        clone.querySelectorAll(".disasm-toolbar, button, select, input").forEach((el) => el.remove());
        // innerText needs the node attached to compute layout-aware text
        clone.style.position = "absolute";
        clone.style.left = "-99999px";
        clone.style.display = "block";
        document.body.appendChild(clone);
        text = clone.innerText;
        clone.remove();
      }
    }
    navigator.clipboard.writeText(text.trim()).then(() => {
      const icon = copyPanelBtn.querySelector("i");
      icon.className = "fa-solid fa-check";
      setTimeout(() => { icon.className = "fa-regular fa-copy"; }, 1200);
    }).catch(() => {});
  });
}

// Resizable layout: sidebar width and bottom panel height (persisted)
(function initResizers() {
  const sidebarResizer = document.getElementById("sidebarResizer");
  const panelResizer = document.getElementById("panelResizer");
  const editorContainer = document.querySelector(".editor-container");

  const savedSidebarW = parseInt(localStorage.getItem("funstudio_sidebar_width"), 10);
  const savedPanelH = parseInt(localStorage.getItem("funstudio_panel_height"), 10);
  if (savedSidebarW) sidebar.style.width = `${savedSidebarW}px`;
  if (savedPanelH) bottomPanel.style.height = `${savedPanelH}px`;

  function startDrag(e, handle, mode, onMove, onEnd) {
    e.preventDefault();
    handle.classList.add("dragging");
    document.body.classList.add("is-resizing", mode === "col" ? "resizing-col" : "resizing-row");
    const move = (ev) => onMove(ev);
    const up = () => {
      handle.classList.remove("dragging");
      document.body.classList.remove("is-resizing", "resizing-col", "resizing-row");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onEnd();
      if (editor) editor.layout();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  if (sidebarResizer) {
    sidebarResizer.addEventListener("pointerdown", (e) => {
      const startX = e.clientX;
      const startW = sidebar.getBoundingClientRect().width;
      startDrag(e, sidebarResizer, "col", (ev) => {
        const maxW = Math.max(200, window.innerWidth - 300);
        const w = Math.min(maxW, Math.max(160, startW + (ev.clientX - startX)));
        sidebar.style.width = `${w}px`;
      }, () => {
        localStorage.setItem("funstudio_sidebar_width", parseInt(sidebar.style.width, 10));
      });
    });
    sidebarResizer.addEventListener("dblclick", () => {
      sidebar.style.width = "290px";
      localStorage.removeItem("funstudio_sidebar_width");
    });
  }

  if (panelResizer) {
    panelResizer.addEventListener("pointerdown", (e) => {
      const startY = e.clientY;
      const startH = bottomPanel.getBoundingClientRect().height;
      startDrag(e, panelResizer, "row", (ev) => {
        const maxH = Math.max(120, editorContainer.getBoundingClientRect().height - 120);
        const h = Math.min(maxH, Math.max(60, startH - (ev.clientY - startY)));
        bottomPanel.style.height = `${h}px`;
      }, () => {
        localStorage.setItem("funstudio_panel_height", parseInt(bottomPanel.style.height, 10));
      });
    });
    panelResizer.addEventListener("dblclick", () => {
      bottomPanel.style.height = "210px";
      localStorage.removeItem("funstudio_panel_height");
    });
  }
})();

// 11. 100% Genuine On-The-Fly Compilation Pipeline
async function compileFirmware() {
  if (currentWorker) {
    currentWorker.terminate();
  }

  // Clear previous compilation terminal logs and diagnostics
  terminalOutput.innerHTML = "";
  diagnosticsList = [];
  applyCompilerDiagnostics();
  if (problemsList) {
    problemsList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem;"><span data-i18n="no_problems">${t("no_problems")}</span></div>`;
  }
  if (problemCountBadge) {
    problemCountBadge.style.display = "none";
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
  resetDisassembly();
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
function highlightOperands(operands) {
  if (!operands) return "";
  let escaped = operands.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  escaped = escaped.replace(/&lt;([a-zA-Z0-9_.]+)(?:\+0x[0-9a-fA-F]+)?&gt;/g, (m, sym) => {
    return `<span class="asm-sym-ref" data-target="${sym}">${m}</span>`;
  });
  escaped = escaped.replace(/\b0x[0-9a-fA-F]+\b/g, (m) => `<span class="asm-num">${m}</span>`);
  escaped = escaped.replace(/(?<![a-zA-Z0-9_])-?\b\d+\b/g, (m) => `<span class="asm-num">${m}</span>`);
  const regRegex = /\b(zero|ra|sp|gp|tp|t[0-6]|s[0-9]|s1[0-1]|a[0-7]|fp|pc|mstatus|mie|mtvec|mscratch|mepc|mcause|mtval|mip)\b/g;
  escaped = escaped.replace(regRegex, (m) => `<span class="asm-reg">${m}</span>`);
  return escaped;
}

function getMnemonicClass(mnemonic) {
  const m = mnemonic.toLowerCase();
  if (/^(j|jr|jal|jalr|beq|bne|blt|bge|bltu|bgeu|bnez|beqz|bgtz|bltz|bgez|blez|ret|tail|call)$/.test(m)) {
    return "asm-inst-jump";
  }
  if (/^(csrr|csrw|csrs|csrc|csrwi|csrsi|csrci|csrrw|csrrs|csrrc|ecall|ebreak|mret|wfi|fence)$/.test(m)) {
    return "asm-inst-sys";
  }
  if (/^(lw|sw|lh|sh|lb|sb|lhu|lbu|c\.lw|c\.sw|c\.lwsp|c\.swsp)$/.test(m)) {
    return "asm-inst-mem";
  }
  if (m.startsWith(".")) {
    return "asm-inst-dir";
  }
  return "asm-inst-alu";
}

function parseDisasmLine(line) {
  const secMatch = line.match(/^Disassembly of section\s+([^\s:]+):/i);
  if (secMatch) return { type: "section", name: secMatch[1] };

  const symMatch = line.match(/^([0-9a-f]+)\s+<([^>]+)>:/i);
  if (symMatch) return { type: "symbol", addr: symMatch[1], name: symMatch[2] };

  if (/^\s*\.\.\.\s*$/.test(line)) return { type: "ellipsis" };

  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return { type: "other", text: line };

  const addrStr = line.slice(0, colonIdx).trim();
  if (!/^[0-9a-f]+$/i.test(addrStr)) return { type: "other", text: line };

  const restOfLine = line.slice(colonIdx + 1);
  const parts = restOfLine.trim().split(/\t+|\s{2,}/);
  if (parts.length < 1) return { type: "other", text: line };

  const hex = parts[0].trim();
  if (!/^[0-9a-f\s]+$/i.test(hex)) return { type: "other", text: line };

  let mnemonic = "";
  let operands = "";
  let comment = "";

  if (parts.length >= 2) {
    const afterHex = restOfLine.trim().slice(hex.length).trim();
    const spaceIdx = afterHex.search(/\s/);
    if (spaceIdx === -1) {
      mnemonic = afterHex;
    } else {
      mnemonic = afterHex.slice(0, spaceIdx);
      operands = afterHex.slice(spaceIdx).trim();
    }
  }

  const hashIdx = operands.indexOf("#");
  if (hashIdx !== -1) {
    comment = operands.slice(hashIdx);
    operands = operands.slice(0, hashIdx).trim();
  }

  return { type: "instruction", addr: addrStr, hex, mnemonic, operands, comment };
}

function resetDisassembly() {
  const container = document.getElementById("disassemblyOutput");
  if (container) {
    container.innerHTML = `<div class="disasm-placeholder">${t("disasm_empty")}</div>`;
  }
  const fnSelect = document.getElementById("disasmFnSelect");
  if (fnSelect) {
    fnSelect.innerHTML = `<option value="">${t("jump_to_fn")}</option>`;
  }
  const badge = document.getElementById("disasmStatsBadge");
  if (badge) {
    badge.textContent = `0 ${t("disasm_instr_count")}`;
  }
  const searchInput = document.getElementById("disasmSearchInput");
  if (searchInput) {
    searchInput.value = "";
  }
}

let disasmEventsInitialized = false;
function initDisassemblyEvents() {
  if (disasmEventsInitialized) return;
  disasmEventsInitialized = true;

  const container = document.getElementById("disassemblyOutput");
  const fnSelect = document.getElementById("disasmFnSelect");
  const searchInput = document.getElementById("disasmSearchInput");
  const copyBtn = document.getElementById("btnCopyDisasm");
  const copyText = document.getElementById("copyDisasmText");

  // Click on symbol reference to jump
  if (container) {
    container.addEventListener("click", (e) => {
      const ref = e.target.closest(".asm-sym-ref");
      if (ref) {
        const sym = ref.getAttribute("data-target");
        if (sym) {
          const target = document.getElementById(`fn-${sym}`);
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            target.classList.add("asm-sym-highlight");
            setTimeout(() => target.classList.remove("asm-sym-highlight"), 1200);
          }
        }
      }
    });
  }

  // Jump from select dropdown
  if (fnSelect) {
    fnSelect.addEventListener("change", (e) => {
      const sym = e.target.value;
      if (!sym) return;
      const target = document.getElementById(`fn-${sym}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.classList.add("asm-sym-highlight");
        setTimeout(() => target.classList.remove("asm-sym-highlight"), 1200);
      }
    });
  }

  // Live filter search
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!container) return;
      const rows = container.querySelectorAll(".asm-row");
      const headers = container.querySelectorAll(".asm-sym-header");

      if (!q) {
        rows.forEach((r) => (r.style.display = ""));
        headers.forEach((h) => (h.style.display = ""));
        return;
      }

      rows.forEach((r) => {
        const text = (r.getAttribute("data-search") || "").toLowerCase();
        r.style.display = text.includes(q) ? "" : "none";
      });

      headers.forEach((h) => {
        const sym = (h.getAttribute("data-sym") || "").toLowerCase();
        let show = sym.includes(q);
        if (!show) {
          let next = h.nextElementSibling;
          while (next && !next.classList.contains("asm-sym-header") && !next.classList.contains("asm-section-header")) {
            if (next.classList.contains("asm-row") && next.style.display !== "none") {
              show = true;
              break;
            }
            next = next.nextElementSibling;
          }
        }
        h.style.display = show ? "" : "none";
      });
    });
  }

  // Copy disassembly
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (!compiledArtifacts || !compiledArtifacts.disasm) return;
      navigator.clipboard.writeText(compiledArtifacts.disasm).then(() => {
        if (copyText) copyText.textContent = t("btn_copied");
        setTimeout(() => {
          if (copyText) copyText.textContent = t("btn_copy_disasm");
        }, 1500);
      });
    });
  }
}

function renderDisassembly(rawDisasm) {
  initDisassemblyEvents();
  const container = document.getElementById("disassemblyOutput");
  const fnSelect = document.getElementById("disasmFnSelect");
  const statsBadge = document.getElementById("disasmStatsBadge");

  if (!rawDisasm || !container) {
    resetDisassembly();
    return;
  }

  const lines = rawDisasm.split("\n");
  const htmlParts = [];
  const functions = [];
  let instructionCount = 0;
  let totalBytes = 0;

  lines.forEach((line) => {
    const parsed = parseDisasmLine(line);

    if (parsed.type === "section") {
      htmlParts.push(`
        <div class="asm-section-header">
          <i class="fa-regular fa-folder-open"></i>
          <span>Section ${escapeHtml(parsed.name)}</span>
          <span class="chip-pill">Machine Code</span>
        </div>
      `);
    } else if (parsed.type === "symbol") {
      functions.push(parsed.name);
      const safeId = `fn-${escapeHtml(parsed.name)}`;
      htmlParts.push(`
        <div class="asm-sym-header" id="${safeId}" data-sym="${escapeHtml(parsed.name)}">
          <div class="asm-sym-title">
            <i class="fa-solid fa-code asm-sym-icon"></i>
            <span class="asm-sym-name">&lt;${escapeHtml(parsed.name)}&gt;</span>
          </div>
          <span class="asm-sym-addr">0x${parsed.addr.padStart(8, "0")}</span>
        </div>
      `);
    } else if (parsed.type === "ellipsis") {
      htmlParts.push(`<div class="asm-ellipsis">... [zeros omitted]</div>`);
    } else if (parsed.type === "instruction") {
      instructionCount++;
      const hexBytes = parsed.hex.replace(/\s+/g, "");
      totalBytes += Math.ceil(hexBytes.length / 2);

      const mnemClass = getMnemonicClass(parsed.mnemonic);
      const argsHtml = highlightOperands(parsed.operands);
      const commentHtml = parsed.comment ? `<span class="asm-comment">${escapeHtml(parsed.comment)}</span>` : "";
      const searchData = escapeHtml(`${parsed.addr} ${parsed.hex} ${parsed.mnemonic} ${parsed.operands} ${parsed.comment}`);

      htmlParts.push(`
        <div class="asm-row" data-search="${searchData}">
          <span class="asm-addr">${escapeHtml(parsed.addr)}:</span>
          <span class="asm-hex">${escapeHtml(parsed.hex)}</span>
          <span class="asm-inst ${mnemClass}">${escapeHtml(parsed.mnemonic)}</span>
          <span class="asm-args">${argsHtml}${commentHtml}</span>
        </div>
      `);
    } else if (parsed.text.trim()) {
      htmlParts.push(`<div style="color: var(--text-muted); padding: 2px 12px; font-size: 0.74rem;">${escapeHtml(parsed.text)}</div>`);
    }
  });

  container.innerHTML = htmlParts.join("");

  // Update stats
  if (statsBadge) {
    statsBadge.textContent = `${instructionCount} ${t("disasm_instr_count")} (${totalBytes} B)`;
  }

  // Populate functions dropdown
  if (fnSelect) {
    let opts = `<option value="">${t("jump_to_fn")}</option>`;
    functions.forEach((fn) => {
      opts += `<option value="${escapeHtml(fn)}">&lt;${escapeHtml(fn)}&gt;</option>`;
    });
    fnSelect.innerHTML = opts;
  }
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

// 14b. Flash to device (WebHID bootloader)
const topFlashBtn = document.getElementById("topFlashBtn");
const flashModal = document.getElementById("flashModal");
const flashStatusEl = document.getElementById("flashStatus");
const flashHintEl = document.getElementById("flashHint");
const flashProgEl = document.getElementById("flashProg");
const flashLogEl = document.getElementById("flashLog");
const flashPairBtn = document.getElementById("flashPairBtn");
const flashFlashBtn = document.getElementById("flashFlashBtn");
const flashBootBtn = document.getElementById("flashBootBtn");
const copyFlashLogBtn = document.getElementById("copyFlashLogBtn");
const closeFlashModalBtn = document.getElementById("closeFlashModalBtn");
const cancelFlashModalBtn = document.getElementById("cancelFlashModalBtn");
const dlOptionFlash = document.getElementById("dlOptionFlash");

let flashBoard = null;
let flashPhase = "idle";

function flashLogAppend(msg) {
  flashLogEl.textContent += msg + "\n";
  flashLogEl.scrollTop = flashLogEl.scrollHeight;
}

function openFlashModal() {
  flashModal.style.display = "flex";
  flashLogEl.textContent = "";
  flashStatusEl.textContent = t("flash_status_idle");
  flashPairBtn.disabled = false;
  if (!compiledArtifacts || !compiledArtifacts.bin) {
    flashHintEl.textContent = t("flash_need_compile");
    flashFlashBtn.disabled = true;
    return;
  }
  flashHintEl.textContent = t("flash_hint_pair");
  flashFlashBtn.disabled = !flashBoard;
}

function closeFlashModal() {
  const wasFlashing = flashBoard && isFlashing();
  if (flashBoard) closeBoard(flashBoard).catch(() => {});
  if (wasFlashing) flashLogAppend(t("flash_error_closed"));
  flashModal.style.display = "none";
  flashProgEl.value = 0;
  flashStatusEl.textContent = t("flash_status_idle");
  flashHintEl.textContent = "";
  flashPairBtn.disabled = false;
  flashFlashBtn.disabled = true;
  flashBootBtn.disabled = true;
}

dlOptionFlash.addEventListener("click", (e) => {
  e.stopPropagation();
  downloadModal.style.display = "none";
  openFlashModal();
});

closeFlashModalBtn.addEventListener("click", closeFlashModal);
cancelFlashModalBtn.addEventListener("click", closeFlashModal);

topFlashBtn.addEventListener("click", openFlashModal);

copyFlashLogBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(flashLogEl.textContent);
  } catch (err) {
    flashLogAppend("(clipboard blocked: " + (err && err.message) + ")");
  }
});

flashPairBtn.addEventListener("click", async () => {
  try {
    const dev = await pairDevice();
    if (!dev) {
      flashStatusEl.textContent = t("flash_error_no_device");
      return;
    }
    flashBoard = dev;
    flashHintEl.textContent = `USB ${dev.vendorId.toString(16).toUpperCase()}:${dev.productId.toString(16).toUpperCase()}`;
    flashStatusEl.textContent = t("flash_status_idle");
    flashFlashBtn.disabled = false;
  } catch (err) {
    flashStatusEl.textContent = t("flash_error_no_device");
  }
});

flashFlashBtn.addEventListener("click", async () => {
  if (!flashBoard || !compiledArtifacts || !compiledArtifacts.bin) return;
  flashPairBtn.disabled = true;
  flashFlashBtn.disabled = true;
  flashBootBtn.disabled = true;
  flashProgEl.value = 0;
  flashPhase = "idle";
  flashLogAppend("paired: USB " + flashBoard.vendorId.toString(16).toUpperCase() + ":" + flashBoard.productId.toString(16).toUpperCase());
  flashHintEl.textContent = t("flash_hint_disconnect");
  flashStatusEl.textContent = t("flash_status_flashing");
  try {
    await flashToBoard(flashBoard, compiledArtifacts.bin, {
      onProgress: (pct) => { flashProgEl.value = pct; },
      onStatus: (phase) => {
        flashPhase = phase;
        flashLogAppend("phase: " + phase);
        if (phase === "reconnect") flashHintEl.textContent = t("flash_hint_reconnect");
        if (phase === "done") flashStatusEl.textContent = t("flash_status_done");
      },
      onLog: (msg) => flashLogAppend(msg),
    });
    flashBootBtn.disabled = false;
  } catch (err) {
    const msg = String(err && err.message || err);
    flashLogAppend("ERROR: " + msg);
    if (/cancelled/i.test(msg)) {
      flashStatusEl.textContent = t("flash_error_closed");
    } else if (msg.includes("timeout")) {
      flashStatusEl.textContent = t(flashPhase === "disconnect" ? "flash_error_not_bootloader" : "flash_error_timeout");
    } else if (/not responding/i.test(msg)) {
      flashStatusEl.textContent = t("flash_error_not_bootloader");
    } else {
      flashStatusEl.textContent = msg;
    }
    flashHintEl.textContent = t("flash_error_retry");
  } finally {
    flashPairBtn.disabled = false;
    flashFlashBtn.disabled = false;
  }
});

flashBootBtn.addEventListener("click", async () => {
  if (!flashBoard) return;
  flashBootBtn.disabled = true;
  flashStatusEl.textContent = t("flash_status_booted");
  await bootBoard(flashBoard, (m) => flashLogAppend(m)).catch(() => {});
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
