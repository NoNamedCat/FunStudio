// FunStudio Project Storage & Lifecycle Manager
// Handles browser persistence via localStorage, project creation, switching, and ZIP export

import { BLANK_TEMPLATE, FUNCONFIG_H, CH32FUN_LD, MCU_PROFILES, EXAMPLES_CATALOGUE } from "./catalogue.js";

const STORAGE_KEY_PROJECTS = "funstudio_projects_v2";
const STORAGE_KEY_ACTIVE = "funstudio_active_project_id_v2";

export class ProjectManager {
  constructor() {
    this.projects = this.loadAllProjectsFromStorage();
    this.activeProjectId = localStorage.getItem(STORAGE_KEY_ACTIVE);

    // If no active project or active project ID doesn't exist, initialize default
    if (!this.projects.length || !this.getProject(this.activeProjectId)) {
      const defaultProj = this.createDefaultProject();
      this.projects = [defaultProj];
      this.activeProjectId = defaultProj.id;
      this.saveToStorage();
    }
  }

  loadAllProjectsFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("Error parsing projects from localStorage:", e);
    }
    return [];
  }

  saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(this.projects));
      localStorage.setItem(STORAGE_KEY_ACTIVE, this.activeProjectId);
    } catch (e) {
      console.error("Error saving projects to localStorage:", e);
    }
  }

  createDefaultProject() {
    const now = Date.now();
    return {
      id: "proj_" + now,
      name: "Blank Project",
      mcu: "ch32v003",
      createdAt: now,
      updatedAt: now,
      files: {
        "main.c": BLANK_TEMPLATE,
        "funconfig.h": FUNCONFIG_H,
        "ch32fun.ld": CH32FUN_LD,
      },
    };
  }

  getProjects() {
    return this.projects;
  }

  getActiveProject() {
    const proj = this.getProject(this.activeProjectId);
    return proj || this.projects[0];
  }

  getProject(id) {
    return this.projects.find((p) => p.id === id);
  }

  createProject(name, mcu = "ch32v003", templateCode = BLANK_TEMPLATE, extraFiles = null) {
    const now = Date.now();
    const files = {
      "main.c": templateCode,
      "funconfig.h": FUNCONFIG_H,
      "ch32fun.ld": CH32FUN_LD,
    };
    if (extraFiles) {
      Object.assign(files, extraFiles);
    }
    const newProj = {
      id: "proj_" + now,
      name: name && name.trim() ? name.trim() : "Project " + new Date().toLocaleDateString(),
      mcu: mcu || "ch32v003",
      createdAt: now,
      updatedAt: now,
      files,
    };
    this.projects.unshift(newProj);
    this.activeProjectId = newProj.id;
    this.saveToStorage();
    return newProj;
  }

  createProjectFromExample(exampleId) {
    const example = EXAMPLES_CATALOGUE.find((ex) => ex.id === exampleId);
    if (!example) throw new Error("Example not found: " + exampleId);

    const mcu = example.mcus.includes("all") ? "ch32v003" : example.mcus[0];
    const name = example.name.replace(/\.c$/, "").replace(/_/g, " ").toUpperCase();
    const files = {
      "main.c": example.code,
      "funconfig.h": example.funconfig || FUNCONFIG_H,
      "ch32fun.ld": CH32FUN_LD,
    };
    if (example.extraFiles) {
      Object.assign(files, example.extraFiles);
    }
    const newProj = {
      id: "proj_" + Date.now(),
      name,
      mcu,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files,
    };
    this.projects.unshift(newProj);
    this.activeProjectId = newProj.id;
    this.saveToStorage();
    return newProj;
  }

  switchProject(id) {
    const proj = this.getProject(id);
    if (!proj) throw new Error("Project not found: " + id);
    this.activeProjectId = id;
    this.saveToStorage();
    return proj;
  }

  saveActiveProjectFiles(filesMap, mcu = null) {
    const proj = this.getActiveProject();
    if (!proj) return;

    proj.files = { ...filesMap };
    if (mcu) proj.mcu = mcu;
    proj.updatedAt = Date.now();
    this.saveToStorage();
  }

  renameProject(id, newName) {
    const proj = this.getProject(id);
    if (!proj) return;
    proj.name = newName.trim() || proj.name;
    proj.updatedAt = Date.now();
    this.saveToStorage();
  }

  deleteProject(id) {
    if (this.projects.length <= 1) {
      throw new Error("No puedes eliminar el único proyecto existente.");
    }
    this.projects = this.projects.filter((p) => p.id !== id);
    if (this.activeProjectId === id) {
      this.activeProjectId = this.projects[0].id;
    }
    this.saveToStorage();
    return this.getActiveProject();
  }

  addFileToActiveProject(filename, content = "") {
    const proj = this.getActiveProject();
    if (!proj) return;
    if (proj.files[filename] !== undefined) {
      throw new Error(`El archivo "${filename}" ya existe en este proyecto.`);
    }
    proj.files[filename] = content;
    proj.updatedAt = Date.now();
    this.saveToStorage();
  }

  deleteFileFromActiveProject(filename) {
    const proj = this.getActiveProject();
    if (!proj) return;
    if (filename === "main.c") {
      throw new Error("No se puede eliminar el archivo principal 'main.c'.");
    }
    delete proj.files[filename];
    proj.updatedAt = Date.now();
    this.saveToStorage();
  }

  async exportProjectAsZip(id = null) {
    const proj = id ? this.getProject(id) : this.getActiveProject();
    if (!proj) return;

    if (typeof window.JSZip === "undefined") {
      // Fallback: download JSON if JSZip is not loaded
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(proj, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${proj.name.replace(/[^a-z0-9_-]/gi, "_")}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      return;
    }

    const zip = new window.JSZip();
    for (const [fname, fcontent] of Object.entries(proj.files)) {
      zip.file(fname, fcontent);
    }
    // Add readme / build instructions
    zip.file(
      "README.md",
      `# ${proj.name}\n\nTarget Microcontroller: ${proj.mcu}\nCreated with FunStudio Web IDE (ch32fun SDK & GNU GCC 15).\n`
    );

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${proj.name.replace(/[^a-z0-9_-]/gi, "_")}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
