// Internationalization (i18n) Engine for FunStudio Web IDE
// Supported languages: English (en), Spanish (es), French (fr), German (de)

export const TRANSLATIONS = {
  en: {
    app_title: "FunStudio",
    project_label: "microcontroller-firmware",
    btn_compile: "Compile (WASM)",
    btn_compiling: "Compiling...",
    btn_clean: "Clean",
    btn_downloads: "Artifacts",
    btn_toggle_sidebar: "Toggle Sidebar",
    btn_toggle_panel: "Toggle Panel",
    btn_new_project: "New Project",
    btn_open_project: "Projects",
    btn_new_file: "New File",
    btn_save_project: "Save",
    btn_export_zip: "Export ZIP",
    
    // Sidebar Views
    explorer_title: "File Explorer",
    examples_title: "Examples Catalogue",
    projects_title: "Project Explorer",
    hardware_title: "Target Microcontroller",
    compiler_title: "Compiler Configuration",
    help_title: "About FunStudio",

    section_project_files: "PROJECT FILES",
    section_current_project: "ACTIVE PROJECT",
    blank_template_label: "main.c",
    search_examples_placeholder: "Search 25+ examples (PWM, ADC, USB, CAN...)",
    filter_all_mcus: "All Microcontrollers",
    clone_as_project: "Create Project",
    open_example: "Open",
    view_example: "Preview",
    active_badge: "ACTIVE",

    // Hardware Specs
    label_board: "Board / Chip Target:",
    label_specs: "Hardware Specifications:",
    spec_core: "Core",
    spec_clock: "Clock Speed",
    spec_sram: "SRAM Memory",
    spec_flash: "Flash ROM",
    spec_periph: "Peripherals",
    
    // Compiler
    label_arch: "ISA Architecture (-march):",
    label_opt: "Optimization Level (-O):",
    label_std: "Language Standard (-std):",
    
    help_text_1: "FunStudio is a specialized online IDE for WCH CH32 RISC-V microcontrollers and the ch32fun SDK.",
    help_text_2: "100% Client-Side: Real GNU GCC 15.2.0 and GNU Binutils 2.44 run directly inside browser WebAssembly with zero server dependency.",
    help_shortcuts: "Keyboard Shortcuts:",
    
    // Panel Tabs
    tab_terminal: "GCC Terminal",
    tab_problems: "Problems",
    tab_disasm: "Disassembly (.s)",
    tab_memory: "Memory Footprint",
    tab_hex: "Intel HEX (.hex)",
    search_disasm_placeholder: "Filter functions, instructions (e.g. main, csrw, 0x296)...",
    jump_to_fn: "⚡ Jump to function...",
    disasm_empty: "Compile firmware to view RISC-V machine code disassembly.",
    btn_copy_disasm: "Copy",
    btn_copied: "Copied!",
    disasm_instr_count: "instructions",
    
    // Terminal & Problems
    terminal_ready: "FunStudio Ready. Press Compile (Ctrl+Enter) to build firmware in WebAssembly.",
    no_problems: "No problems detected in current source file.",
    problems_found: "problem(s) found",
    
    // Memory
    mem_flash_title: "Flash ROM Utilized",
    mem_sram_title: "SRAM Memory Utilized",
    mem_used_label: "Bytes used",
    mem_total_label: "of",
    th_section: "ELF Section",
    th_desc: "Description",
    th_size: "Size (Bytes)",
    th_dest: "Memory Region",
    
    // Status Bar
    status_ready: "GCC 15.2.0 Ready",
    status_compiling: "Compiling GCC...",
    status_success: "Build Succeeded",
    status_error: "Build Failed",
    badge_in_browser: "100% In-Browser",
    
    // Downloads
    dl_elf: "Download Firmware (.ELF)",
    dl_hex: "Download Intel HEX (.HEX)",
    dl_bin: "Download Raw Binary (.BIN)",
    dl_asm: "Download Assembly (.S)",
    dl_zip: "Download Project ZIP (.ZIP)",
    dl_alert_empty: "Compile firmware first before downloading.",
    dl_flash: "Flash to device",
    flash_title: "Flash CH32V003 (WebHID)",
    flash_pair: "Connect device",
    flash_flash: "Flash .bin",
    flash_boot: "Boot application",
    flash_close: "Close",
    flash_need_compile: "Compile first, then flash.",
    flash_status_idle: "Idle",
    flash_status_flashing: "Flashing…",
    flash_status_done: "Flash completed",
    flash_status_booted: "Booting application",
    flash_hint_pair: "Select the CH32V003 in the list (only the first time asks).",
    flash_hint_disconnect: "Disconnect your board now, then reconnect it to enter bootloader mode.",
    flash_hint_reconnect: "Connect your board in bootloader mode…",
    flash_error_no_device: "No device selected. Connect the device first.",
    flash_error_timeout: "Bootloader timeout: the board left bootloader mode. Run the flash again.",
    flash_error_not_bootloader: "The device did not answer in bootloader mode. Re-run after disconnecting/reconnecting.",
    flash_error_closed: "Flash cancelled (modal closed).",
    flash_error_retry: "Flash failed. The board reboots into the app after about 10 s — then click Flash again.",
  },

  es: {
    app_title: "FunStudio",
    project_label: "microcontroller-firmware",
    btn_compile: "Compilar (WASM)",
    btn_compiling: "Compilando...",
    btn_clean: "Limpiar",
    btn_downloads: "Artefactos",
    btn_toggle_sidebar: "Alternar Barra Lateral",
    btn_toggle_panel: "Alternar Panel Inferior",
    btn_new_project: "Nuevo Proyecto",
    btn_open_project: "Proyectos",
    btn_new_file: "Nuevo Archivo",
    btn_save_project: "Guardar",
    btn_export_zip: "Exportar ZIP",
    
    // Sidebar Views
    explorer_title: "Explorador de Archivos",
    examples_title: "Catálogo de Ejemplos",
    projects_title: "Explorador de Proyectos",
    hardware_title: "Microcontrolador Objetivo",
    compiler_title: "Configuración del Compilador",
    help_title: "Acerca de FunStudio",

    section_project_files: "ARCHIVOS DEL PROYECTO",
    section_current_project: "PROYECTO ACTIVO",
    blank_template_label: "main.c",
    search_examples_placeholder: "Buscar entre 25+ ejemplos (PWM, ADC, USB, CAN...)",
    filter_all_mcus: "Todos los Microcontroladores",
    clone_as_project: "Crear Proyecto",
    open_example: "Abrir",
    view_example: "Ver",
    active_badge: "ACTIVO",

    // Hardware Specs
    label_board: "Microcontrolador / Placa:",
    label_specs: "Especificaciones del Chip:",
    spec_core: "Núcleo",
    spec_clock: "Frecuencia",
    spec_sram: "Memoria SRAM",
    spec_flash: "Memoria Flash",
    spec_periph: "Periféricos",
    
    // Compiler
    label_arch: "Arquitectura ISA (-march):",
    label_opt: "Nivel de Optimización (-O):",
    label_std: "Estándar de Lenguaje (-std):",
    
    help_text_1: "FunStudio es un IDE web especializado para microcontroladores RISC-V WCH CH32 y el SDK ch32fun.",
    help_text_2: "100% en el Navegador: GNU GCC 15.2.0 y GNU Binutils 2.44 corren directamente en WebAssembly sin servidores externos.",
    help_shortcuts: "Atajos de Teclado:",
    
    // Panel Tabs
    tab_terminal: "Terminal GCC",
    tab_problems: "Problemas",
    tab_disasm: "Desensamblado (.s)",
    tab_memory: "Uso de Memoria",
    tab_hex: "Intel HEX (.hex)",
    search_disasm_placeholder: "Filtrar funciones, instrucciones (ej. main, csrw, 0x296)...",
    jump_to_fn: "⚡ Ir a función...",
    disasm_empty: "Compila el firmware para ver el desensamblado de código máquina RISC-V.",
    btn_copy_disasm: "Copiar",
    btn_copied: "¡Copiado!",
    disasm_instr_count: "instrucciones",
    
    // Terminal & Problems
    terminal_ready: "FunStudio Listo. Presiona Compilar (Ctrl+Enter) para construir el firmware en WebAssembly.",
    no_problems: "No se detectaron problemas en el código fuente actual.",
    problems_found: "problema(s) detectado(s)",
    
    // Memory
    mem_flash_title: "Memoria Flash ROM Utilizada",
    mem_sram_title: "Memoria SRAM Utilizada",
    mem_used_label: "Bytes usados",
    mem_total_label: "de",
    th_section: "Sección ELF",
    th_desc: "Descripción",
    th_size: "Tamaño (Bytes)",
    th_dest: "Región de Memoria",
    
    // Status Bar
    status_ready: "GCC 15.2.0 Listo",
    status_compiling: "Compilando GCC...",
    status_success: "Compilación Exitosa",
    status_error: "Error de Compilación",
    badge_in_browser: "100% en el Navegador",
    
    // Downloads
    dl_elf: "Descargar Firmware (.ELF)",
    dl_hex: "Descargar Intel HEX (.HEX)",
    dl_bin: "Descargar Binario Raw (.BIN)",
    dl_asm: "Descargar Ensamblador (.S)",
    dl_zip: "Descargar Proyecto en ZIP (.ZIP)",
    dl_alert_empty: "Compila el firmware antes de descargar artefactos.",
    dl_flash: "Flashar al dispositivo",
    flash_title: "Flash CH32V003 (WebHID)",
    flash_pair: "Conectar dispositivo",
    flash_flash: "Flash .bin",
    flash_boot: "Arrancar aplicación",
    flash_close: "Cerrar",
    flash_need_compile: "Primero compila, luego flash.",
    flash_status_idle: "Inactivo",
    flash_status_flashing: "Flashando…",
    flash_status_done: "Flash completado",
    flash_status_booted: "Arrancando aplicación",
    flash_hint_pair: "Selecciona la CH32V003 en la lista (solo pide permiso la primera vez).",
    flash_hint_disconnect: "Desconecta ahora tu placa y vuelve a conectarla para entrar en modo bootloader.",
    flash_hint_reconnect: "Conecta tu placa en modo bootloader…",
    flash_error_no_device: "No hay dispositivo seleccionado. Conecta el dispositivo primero.",
    flash_error_timeout: "Timeout del bootloader: la placa salió del modo bootloader. Vuelve a ejecutar el flash.",
    flash_error_not_bootloader: "El dispositivo no respondió en modo bootloader. Reintenta tras desconectar/reconectar.",
    flash_error_closed: "Flash cancelado (se cerró el modal).",
    flash_error_retry: "Falló el flash. La placa vuelve a la app en unos 10 s — luego vuelve a pulsar Flash.",
  },

  fr: {
    app_title: "FunStudio",
    project_label: "microcontroller-firmware",
    btn_compile: "Compiler (WASM)",
    btn_compiling: "Compilation...",
    btn_clean: "Effacer",
    btn_downloads: "Téléchargements",
    btn_toggle_sidebar: "Basculer la barre latérale",
    btn_toggle_panel: "Basculer le panneau",
    btn_new_project: "Nouveau Projet",
    btn_open_project: "Projets",
    btn_new_file: "Nouveau Fichier",
    btn_save_project: "Enregistrer",
    btn_export_zip: "Exporter ZIP",
    
    explorer_title: "Explorateur de Fichiers",
    examples_title: "Catalogue d'Exemples",
    projects_title: "Explorateur de Projets",
    hardware_title: "Microcontrôleur Cible",
    compiler_title: "Options du Compilateur",
    help_title: "À propos de FunStudio",

    section_project_files: "FICHIERS DU PROJET",
    section_current_project: "PROJET ACTIF",
    blank_template_label: "main.c",
    search_examples_placeholder: "Rechercher des exemples...",
    filter_all_mcus: "Tous les microcontrôleurs",
    clone_as_project: "Créer un Projet",
    open_example: "Ouvrir",
    view_example: "Aperçu",
    active_badge: "ACTIF",

    label_board: "Microcontrôleur / Carte :",
    label_specs: "Spécifications Matérielles :",
    spec_core: "Cœur",
    spec_clock: "Fréquence",
    spec_sram: "Mémoire SRAM",
    spec_flash: "Mémoire Flash",
    spec_periph: "Périphériques",
    
    label_arch: "Architecture ISA (-march) :",
    label_opt: "Niveau d'Optimisation (-O) :",
    label_std: "Standard de Langage (-std) :",
    
    help_text_1: "FunStudio est un IDE Web dédié aux microcontrôleurs WCH CH32 RISC-V et au SDK ch32fun.",
    help_text_2: "100% Côté Client : GCC 15 et GNU Binutils s'exécutent entièrement en WebAssembly.",
    help_shortcuts: "Raccourcis Clavier :",
    
    tab_terminal: "Terminal GCC",
    tab_problems: "Problèmes",
    tab_disasm: "Désassemblage (.s)",
    tab_memory: "Mémoire",
    tab_hex: "Intel HEX (.hex)",
    search_disasm_placeholder: "Filtrer fonctions, instructions (ex. main, csrw, 0x296)...",
    jump_to_fn: "⚡ Aller à la fonction...",
    disasm_empty: "Compilez le firmware pour afficher le désassemblage RISC-V.",
    btn_copy_disasm: "Copier",
    btn_copied: "Copié !",
    disasm_instr_count: "instructions",
    
    terminal_ready: "FunStudio Prêt. Appuyez sur Compiler pour créer le firmware.",
    no_problems: "Aucun problème détecté.",
    problems_found: "problème(s) détecté(s)",
    
    mem_flash_title: "Mémoire Flash Utilisée",
    mem_sram_title: "Mémoire SRAM Utilisée",
    mem_used_label: "Octets utilisés",
    mem_total_label: "sur",
    th_section: "Section ELF",
    th_desc: "Description",
    th_size: "Taille (Octets)",
    th_dest: "Région Mémoire",
    
    status_ready: "GCC 15.2.0 Prêt",
    status_compiling: "Compilation...",
    status_success: "Succès",
    status_error: "Échec",
    badge_in_browser: "100% dans le Navigateur",
    
    dl_elf: "Télécharger Firmware (.ELF)",
    dl_hex: "Télécharger Intel HEX (.HEX)",
    dl_bin: "Télécharger Binaire (.BIN)",
    dl_asm: "Télécharger Assembleur (.S)",
    dl_zip: "Télécharger Projet ZIP (.ZIP)",
    dl_alert_empty: "Veuillez d'abord compiler le firmware.",
    dl_flash: "Flasher vers le dispositif",
    flash_title: "Flash CH32V003 (WebHID)",
    flash_pair: "Connecter le dispositif",
    flash_flash: "Flash .bin",
    flash_boot: "Démarrer l'application",
    flash_close: "Fermer",
    flash_need_compile: "Compilez d'abord, puis flashez.",
    flash_status_idle: "Inactif",
    flash_status_flashing: "Flash en cours…",
    flash_status_done: "Flash terminé",
    flash_status_booted: "Démarrage de l'application",
    flash_hint_pair: "Sélectionnez la CH32V003 dans la liste (la demande ne s'affiche qu'une seule fois).",
    flash_hint_disconnect: "Débranchez maintenant votre carte, puis rebranchez-la pour entrer en mode bootloader.",
    flash_hint_reconnect: "Branchez votre carte en mode bootloader…",
    flash_error_no_device: "Aucun dispositif sélectionné. Connectez d'abord le dispositif.",
    flash_error_timeout: "Timeout du bootloader : la carte a quitté le mode bootloader. Relancez le flash.",
    flash_error_not_bootloader: "Le dispositif ne répond pas en mode bootloader. Relancez après débranchement/rebranchement.",
    flash_error_closed: "Flash annulé (fenêtre fermée).",
    flash_error_retry: "Échec du flash. La carte redémarre en application après ~10 s — relancez Flash ensuite.",
  },

  de: {
    app_title: "FunStudio",
    project_label: "microcontroller-firmware",
    btn_compile: "Kompilieren (WASM)",
    btn_compiling: "Kompiliert...",
    btn_clean: "Bereinigen",
    btn_downloads: "Downloads",
    btn_toggle_sidebar: "Seitenleiste umschalten",
    btn_toggle_panel: "Bedienfeld umschalten",
    btn_new_project: "Neues Projekt",
    btn_open_project: "Projekte",
    btn_new_file: "Neue Datei",
    btn_save_project: "Speichern",
    btn_export_zip: "ZIP exportieren",
    
    explorer_title: "Datei-Explorer",
    examples_title: "Beispielkatalog",
    projects_title: "Projekt-Explorer",
    hardware_title: "Ziel-Mikrocontroller",
    compiler_title: "Compiler-Optionen",
    help_title: "Über FunStudio",

    section_project_files: "PROJEKTDATEIEN",
    section_current_project: "AKTIVES PROJEKT",
    blank_template_label: "main.c",
    search_examples_placeholder: "Beispiele durchsuchen...",
    filter_all_mcus: "Alle Mikrocontroller",
    clone_as_project: "Projekt erstellen",
    open_example: "Öffnen",
    view_example: "Vorschau",
    active_badge: "AKTIV",

    label_board: "Board / Chip-Ziel:",
    label_specs: "Hardwarespezifikationen:",
    spec_core: "Kern",
    spec_clock: "Taktfrequenz",
    spec_sram: "SRAM-Speicher",
    spec_flash: "Flash-Speicher",
    spec_periph: "Peripherie",
    
    label_arch: "ISA-Architektur (-march):",
    label_opt: "Optimierungsstufe (-O):",
    label_std: "Sprachstandard (-std):",
    
    help_text_1: "FunStudio ist eine spezialisierte Web-IDE für WCH CH32 RISC-V Mikrocontroller und das ch32fun SDK.",
    help_text_2: "100% Client-Side: GNU GCC 15.2.0 und Binutils laufen direkt im WebAssembly Ihres Browsers.",
    help_shortcuts: "Tastaturkürzel:",
    
    tab_terminal: "GCC-Terminal",
    tab_problems: "Probleme",
    tab_disasm: "Disassemblierung (.s)",
    tab_memory: "Speicherbelegung",
    tab_hex: "Intel HEX (.hex)",
    search_disasm_placeholder: "Funktionen, Befehle filtern (z.B. main, csrw, 0x296)...",
    jump_to_fn: "⚡ Zu Funktion springen...",
    disasm_empty: "Firmware kompilieren, um RISC-V Maschinencode anzuzeigen.",
    btn_copy_disasm: "Kopieren",
    btn_copied: "Kopiert!",
    disasm_instr_count: "Befehle",
    
    terminal_ready: "FunStudio Bereit. Drücken Sie Kompilieren, um die Firmware zu bauen.",
    no_problems: "Keine Probleme erkannt.",
    problems_found: "Problem(e) gefunden",
    
    mem_flash_title: "Flash-Speicher Belegt",
    mem_sram_title: "SRAM-Speicher Belegt",
    mem_used_label: "Bytes belegt",
    mem_total_label: "von",
    th_section: "ELF-Abschnitt",
    th_desc: "Beschreibung",
    th_size: "Größe (Bytes)",
    th_dest: "Speicherregion",
    
    status_ready: "GCC 15.2.0 Bereit",
    status_compiling: "Kompiliert...",
    status_success: "Erfolgreich",
    status_error: "Fehlgeschlagen",
    badge_in_browser: "100% im Browser",
    
    dl_elf: "Firmware herunterladen (.ELF)",
    dl_hex: "Intel HEX herunterladen (.HEX)",
    dl_bin: "Rohbinärdatei (.BIN)",
    dl_asm: "Assembler herunterladen (.S)",
    dl_zip: "Projekt-ZIP herunterladen (.ZIP)",
    dl_alert_empty: "Bitte kompilieren Sie die Firmware zuerst.",
    dl_flash: "An Gerät flashen",
    flash_title: "Flash CH32V003 (WebHID)",
    flash_pair: "Gerät verbinden",
    flash_flash: ".bin flashen",
    flash_boot: "Anwendung starten",
    flash_close: "Schließen",
    flash_need_compile: "Erst kompilieren, dann flashen.",
    flash_status_idle: "Inaktiv",
    flash_status_flashing: "Flashen…",
    flash_status_done: "Flash abgeschlossen",
    flash_status_booted: "Anwendung wird gestartet",
    flash_hint_pair: "Wählen Sie die CH32V003 in der Liste (die Abfrage erscheint nur einmal).",
    flash_hint_disconnect: "Trennen Sie jetzt Ihre Platine und schließen Sie sie wieder an, um den Bootloader-Modus zu betreten.",
    flash_hint_reconnect: "Schließen Sie Ihre Platine im Bootloader-Modus an…",
    flash_error_no_device: "Kein Gerät ausgewählt. Verbinden Sie zuerst das Gerät.",
    flash_error_timeout: "Bootloader-Timeout: Die Platine verließ den Bootloader-Modus. Starten Sie den Flash neu.",
    flash_error_not_bootloader: "Das Gerät antwortet nicht im Bootloader-Modus. Neu ausführen nach Trennen/Erneut Verbinden.",
    flash_error_closed: "Flash abgebrochen (Fenster geschlossen).",
    flash_error_retry: "Flash fehlgeschlagen. Die Platine kehrt nach ~10 s zur App zurück — dann erneut Flash starten.",
  },
};

let currentLang = (typeof localStorage !== "undefined" ? localStorage.getItem("funstudio_lang") : null) || "es";

export function getLanguage() {
  return currentLang;
}

export function setLanguage(lang) {
  if (TRANSLATIONS[lang]) {
    currentLang = lang;
    localStorage.setItem("funstudio_lang", lang);
    applyTranslations();
  }
}

export function t(key) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  return dict[key] || TRANSLATIONS.en[key] || key;
}

export function applyTranslations() {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (dict[key]) {
      el.setAttribute("title", dict[key]);
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (dict[key]) {
      el.setAttribute("placeholder", dict[key]);
    }
  });

  const langSelect = document.getElementById("langSelect");
  if (langSelect && langSelect.value !== currentLang) {
    langSelect.value = currentLang;
  }
}
