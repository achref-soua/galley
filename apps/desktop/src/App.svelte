<script lang="ts">
  import { untrack } from 'svelte';
  import { type ThemePreference } from '@galley/ui-kit';
  import { ThemeController, browserThemeEnv } from './lib/theme';
  import { LayoutController } from './lib/layout-store';
  import { prefersReducedMotion } from './lib/motion';
  import { ProjectController } from './lib/project-store';
  import { selectBackend } from './lib/project-backend';
  import { selectLanguageBackend, type LanguageBackend } from './lib/language-backend';
  import { mergeDiagnostics } from './lib/diagnostics';
  import { RecentProjectsStore } from './lib/recent-projects';
  import { CompilePrefsStore, PreviewPrefsStore } from './lib/settings-store';
  import { EditorPrefsStore, type EditorPrefs, type KeymapMode } from './lib/keymap-prefs';
  import { type SpellChecker, buildSpellChecker } from './lib/spell-check';
  import {
    createLatexEditor,
    type EditorFactory,
    type LanguageContext,
    type LatexEditor,
    type RevealRequest
  } from './lib/editor';
  import { pdfjsRenderer, type PdfRenderer } from './lib/pdf';
  import {
    selectSyncTexBackend,
    type SyncTexBackend,
    type SyncTexBox
  } from './lib/synctex-backend';
  import { windowTimer, type Timer } from './lib/debounce';
  import { systemClock, type Clock } from './lib/timing';
  import { webAudioBell, type Bell } from './lib/bell';
  import {
    isCompileShortcut,
    isSaveShortcut,
    isCommandPaletteShortcut,
    isSearchShortcut
  } from './lib/keymap';
  import { type PaletteAction } from './lib/palette';
  import { parseIncludes, resolveIncludePath } from './lib/include-graph';
  import { needsGraphicspath, insertGraphicspath, assetSnippet } from './lib/assets';
  import { selectAssetBackend, type AssetBackend } from './lib/asset-backend';
  import { selectBibBackend, type BibBackend } from './lib/bib-backend';
  import { citeCandidates as buildCiteCandidates } from './lib/bibliography';
  import { realMathFieldSetup, type MathFieldSetup } from './lib/math-field.js';
  import Titlebar from './lib/Titlebar.svelte';
  import FormatBar from './lib/FormatBar.svelte';
  import Sidebar from './lib/Sidebar.svelte';
  import AssetPanel from './lib/AssetPanel.svelte';
  import BibPanel from './lib/BibPanel.svelte';
  import SymbolPalette from './lib/SymbolPalette.svelte';
  import MathEditor from './lib/MathEditor.svelte';
  import TableBuilder from './lib/TableBuilder.svelte';
  import EditorPane from './lib/EditorPane.svelte';
  import ProblemsPanel from './lib/ProblemsPanel.svelte';
  import OutlinePanel from './lib/OutlinePanel.svelte';
  import PreviewPane from './lib/PreviewPane.svelte';
  import Resizer from './lib/Resizer.svelte';
  import Settings from './lib/Settings.svelte';
  import UnsavedGuard from './lib/UnsavedGuard.svelte';
  import CommandPalette from './lib/CommandPalette.svelte';
  import SearchPanel from './lib/SearchPanel.svelte';
  import StatusBar from './lib/StatusBar.svelte';

  // The editor, PDF renderer, and compile timing/sound are injectable so tests
  // can drive the UI with fakes; the packaged app uses the real CodeMirror
  // editor, PDF.js renderer, debounce timer, clock, and Web Audio bell.
  let {
    editor = createLatexEditor,
    createRenderer = pdfjsRenderer,
    compileTimer = windowTimer(),
    compileClock = systemClock(),
    bell = webAudioBell(),
    language = selectLanguageBackend(),
    synctex = selectSyncTexBackend(),
    assetBackend = selectAssetBackend(),
    bibBackend = selectBibBackend(),
    mathFieldSetup = realMathFieldSetup
  }: {
    editor?: EditorFactory;
    createRenderer?: () => PdfRenderer;
    compileTimer?: Timer;
    compileClock?: Clock;
    bell?: Bell;
    language?: LanguageBackend;
    synctex?: SyncTexBackend;
    assetBackend?: AssetBackend;
    bibBackend?: BibBackend;
    mathFieldSetup?: MathFieldSetup;
  } = $props();

  const RESIZE_STEP = 16;

  const theme = new ThemeController(browserThemeEnv());
  const layoutController = new LayoutController(window.localStorage);
  const prefsStore = new CompilePrefsStore(window.localStorage);
  const previewPrefsStore = new PreviewPrefsStore(window.localStorage);
  const editorPrefsStore = new EditorPrefsStore(window.localStorage);
  const backend = selectBackend();
  // The injected timer/clock/bell are construction-time configuration, not
  // reactive inputs, so read their initial values untracked.
  const projectController = untrack(
    () =>
      new ProjectController(backend, new RecentProjectsStore(window.localStorage), {
        timer: compileTimer,
        clock: compileClock,
        bell,
        autoCompile: prefsStore.prefs.autoCompile,
        soundOnSuccess: prefsStore.prefs.soundOnSuccess,
        language,
        bib: bibBackend
      })
  );

  let preference = $state<ThemePreference>(theme.preference);
  let layout = $state(layoutController.state);
  let settingsOpen = $state(false);
  let paletteOpen = $state(false);
  let searchOpen = $state(false);
  let mathOpen = $state(false);
  let tableOpen = $state(false);
  let viewMode = $state<'code' | 'visual'>('code');
  let project = $state(projectController.state);
  let compilePrefs = $state(prefsStore.prefs);
  let previewPrefs = $state(previewPrefsStore.prefs);
  let editorPrefs = $state<EditorPrefs>(editorPrefsStore.prefs);
  let spellChecker = $state<SpellChecker | null>(null);
  let revealTarget = $state<RevealRequest | null>(null);
  let editorScrollFraction = $state<number | undefined>(undefined);
  projectController.subscribe((state) => (project = state));
  previewPrefsStore.subscribe((p) => {
    previewPrefs = p;
  });
  editorPrefsStore.subscribe((prefs) => {
    editorPrefs = prefs;
  });
  const reduceMotion = prefersReducedMotion();
  let searchRoot = $state<string | null>(null);
  let graphicspathBannerDismissed = $state(false);
  $effect(() => {
    searchRoot = project.project == null ? null : project.project.root;
  });

  let resizeBaseline = 0;
  // A monotonic stamp so clicking the same problem twice still re-jumps.
  let revealNonce = 0;

  // SyncTeX: the live editor reference (set by EditorPane's oncreate callback)
  // and the current forward-search highlight box.
  let editorRef = $state<LatexEditor | null>(null);
  let highlightBox = $state<SyncTexBox | null>(null);

  async function handleForwardSearch() {
    const file = project.activePath;
    if (file === null || editorRef === null) return;
    const line = editorRef.currentLine();
    highlightBox = await synctex.forward(file, line);
  }

  async function handleInverseSearch(page: number, x: number, y: number) {
    const loc = await synctex.inverse(page, x, y);
    if (loc === null) return;
    jumpToLine(loc.line);
  }

  // Load the English dictionary when spell-check is toggled on; release on off.
  $effect(() => {
    if (editorPrefs.spellCheck) {
      void fetchSpellChecker().then((c) => {
        spellChecker = c;
      });
    } else {
      spellChecker = null;
    }
  });

  async function fetchSpellChecker(): Promise<SpellChecker | null> {
    try {
      const [affRes, dicRes] = await Promise.all([
        fetch('/dict/index.aff'),
        fetch('/dict/index.dic')
      ]);
      if (!affRes.ok || !dicRes.ok) {
        return null;
      }
      const [aff, dic] = await Promise.all([affRes.text(), dicRes.text()]);
      return buildSpellChecker(aff, dic);
    } catch {
      return null;
    }
  }

  function jumpToLine(line: number) {
    revealNonce += 1;
    revealTarget = { line, nonce: revealNonce };
  }

  // The editor's bridge to the language server: it reads the live open document
  // and routes go-to-definition back through the controller (which owns the
  // resolve/open/reveal decisions). Built once with the injected backend
  // (construction-time config, so read untracked); the delegates query the
  // controller at call time.
  const editorLanguage: LanguageContext = untrack(() => ({
    backend: language,
    document: () => projectController.currentDocument(),
    onDefinition: (location) => void projectController.goToDefinition(location, jumpToLine)
  }));

  // The palette actions: static list of commands the user can fuzzy-search.
  const paletteActions: PaletteAction[] = [
    {
      id: 'save',
      label: 'Save',
      shortcut: 'Ctrl+S',
      run() {
        void projectController.save();
      }
    },
    {
      id: 'compile',
      label: 'Compile',
      shortcut: 'Ctrl+B',
      run() {
        void projectController.compile();
      }
    },
    {
      id: 'find-in-project',
      label: 'Find in Project',
      shortcut: 'Ctrl+Shift+F',
      run() {
        searchOpen = true;
      }
    },
    {
      id: 'toggle-sidebar',
      label: 'Toggle Sidebar',
      run() {
        toggleSidebar();
      }
    },
    {
      id: 'toggle-preview',
      label: 'Toggle Preview',
      run() {
        togglePreview();
      }
    },
    {
      id: 'open-settings',
      label: 'Open Settings',
      run() {
        settingsOpen = true;
      }
    },
    {
      id: 'toggle-view-mode',
      label: 'Toggle Visual Mode',
      run() {
        toggleViewMode();
      }
    },
    {
      id: 'insert-equation',
      label: 'Insert Equation',
      shortcut: '∑',
      run() {
        mathOpen = true;
      }
    },
    {
      id: 'insert-table',
      label: 'Insert Table',
      shortcut: '⊞',
      run() {
        tableOpen = true;
      }
    }
  ];

  const sidebarStyle = $derived(`width: ${layout.sidebarWidth}px`);
  const previewStyle = $derived(`width: ${layout.previewWidth}px`);
  const documentName = $derived(project.activePath ?? 'No document');
  const dirty = $derived(project.activePath !== null && project.content !== project.savedContent);
  const canCompile = $derived(project.activePath !== null);
  const compiling = $derived(project.compile.status === 'running');
  // The gutter and problems panel show the union of the compile log's
  // diagnostics and the language server's, de-duplicated.
  const diagnostics = $derived(
    mergeDiagnostics(project.compile.diagnostics, project.lspDiagnostics)
  );
  // Resolved include paths from the live editor content, shown in the structure panel.
  const includes = $derived(parseIncludes(project.content).map(resolveIncludePath));
  // Citation candidates parsed from the project's `.bib` files, for the panel.
  const bibCandidates = $derived(buildCiteCandidates(project.bibEntries));
  const showGraphicspathBanner = $derived(
    project.project !== null && !graphicspathBannerDismissed && needsGraphicspath(project.content)
  );

  function handleEditorScroll(frac: number) {
    editorScrollFraction = frac;
  }

  function changeSyncScroll(enabled: boolean) {
    previewPrefsStore.setSyncScroll(enabled);
    previewPrefs = previewPrefsStore.prefs;
  }

  function changeTheme(pref: ThemePreference) {
    theme.setPreference(pref);
    preference = pref;
  }

  function changeAutoCompile(enabled: boolean) {
    prefsStore.setAutoCompile(enabled);
    projectController.setAutoCompile(enabled);
    compilePrefs = prefsStore.prefs;
  }

  function changeSound(enabled: boolean) {
    prefsStore.setSoundOnSuccess(enabled);
    projectController.setSoundOnSuccess(enabled);
    compilePrefs = prefsStore.prefs;
  }

  function changeKeymapMode(mode: KeymapMode) {
    editorPrefsStore.setKeymapMode(mode);
  }

  function changeSpellCheck(enabled: boolean) {
    editorPrefsStore.setSpellCheck(enabled);
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (isSaveShortcut(event)) {
      event.preventDefault();
      void projectController.save();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void handleForwardSearch();
    } else if (isCompileShortcut(event) && viewMode === 'code') {
      event.preventDefault();
      void projectController.compile();
    } else if (isCommandPaletteShortcut(event)) {
      event.preventDefault();
      paletteOpen = !paletteOpen;
      searchOpen = false;
    } else if (isSearchShortcut(event)) {
      event.preventDefault();
      searchOpen = !searchOpen;
      paletteOpen = false;
    }
  }

  function toggleSidebar() {
    layoutController.toggleSidebar();
    layout = layoutController.state;
  }

  function togglePreview() {
    layoutController.togglePreview();
    layout = layoutController.state;
  }

  function startSidebarResize() {
    resizeBaseline = layout.sidebarWidth;
  }

  function sidebarResize(delta: number) {
    layoutController.setSidebarWidth(resizeBaseline + delta);
    layout = layoutController.state;
  }

  function stepSidebar(direction: number) {
    layoutController.setSidebarWidth(layout.sidebarWidth + direction * RESIZE_STEP);
    layout = layoutController.state;
  }

  function startPreviewResize() {
    resizeBaseline = layout.previewWidth;
  }

  function previewResize(delta: number) {
    layoutController.setPreviewWidth(resizeBaseline - delta);
    layout = layoutController.state;
  }

  function stepPreview(direction: number) {
    layoutController.setPreviewWidth(layout.previewWidth - direction * RESIZE_STEP);
    layout = layoutController.state;
  }

  function endResize() {}

  function applyGraphicspath() {
    projectController.edit(insertGraphicspath(project.content));
    graphicspathBannerDismissed = true;
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    if (project.project === null) return;
    const dt = event.dataTransfer;
    if (dt == null || dt.files.length === 0) return;
    const file = dt.files[0];
    const bytes = new Uint8Array(await file.arrayBuffer());
    const rel = await assetBackend.copyAsset(project.project.root, bytes, file.name);
    editorRef!.insertAtCursor(assetSnippet(rel));
  }

  function handleReplace(path: string, newContent: string) {
    if (path === project.activePath) {
      projectController.edit(newContent);
    }
  }

  function toggleViewMode() {
    viewMode = viewMode === 'code' ? 'visual' : 'code';
  }

  function insertMath(wrapped: string) {
    editorRef!.insertAtCursor(wrapped);
    mathOpen = false;
  }

  function insertTable(latex: string) {
    editorRef!.insertAtCursor(latex);
    tableOpen = false;
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="app">
  <Titlebar
    {documentName}
    {dirty}
    canSave={dirty}
    {canCompile}
    {compiling}
    sidebarCollapsed={layout.sidebarCollapsed}
    previewCollapsed={layout.previewCollapsed}
    {viewMode}
    oncompile={() => void projectController.compile()}
    onsave={() => void projectController.save()}
    ontogglesidebar={toggleSidebar}
    ontogglepreview={togglePreview}
    onopensettings={() => (settingsOpen = true)}
    onopenmatch={() => (mathOpen = true)}
    onopentable={() => (tableOpen = true)}
    ontoggleviewmode={toggleViewMode}
  />

  <main class="workspace">
    {#if !layout.sidebarCollapsed}
      <div class="pane sidebar" style={sidebarStyle}>
        <Sidebar
          project={project.project}
          activePath={project.activePath}
          recent={project.recent}
          onopenfile={(path) => void projectController.requestOpenFile(path)}
          onnewproject={(name) => void projectController.pickAndCreate(name)}
          onopenfolder={() => void projectController.pickAndOpen()}
          onopenrecent={(root) => void projectController.openFolder(root)}
        />
        {#if project.project !== null}
          <AssetPanel
            root={project.project.root}
            backend={assetBackend}
            oninsert={(snippet) => editorRef!.insertAtCursor(snippet)}
          />
          <BibPanel
            candidates={bibCandidates}
            oninsert={(cite) => editorRef!.insertAtCursor(cite)}
            onlookup={(query, kind) => projectController.addReference(query, kind)}
            onimport={(content) => projectController.importBibText(content)}
          />
          <SymbolPalette oninsert={(code) => editorRef!.insertAtCursor(code)} />
        {/if}
      </div>
      <Resizer
        label="Resize sidebar"
        onresizestart={startSidebarResize}
        onresize={sidebarResize}
        onresizeend={endResize}
        onstep={stepSidebar}
      />
    {/if}

    <div class="pane editor">
      <div class="editor-stack">
        {#if viewMode === 'visual'}
          <FormatBar
            onbold={() => editorRef!.toggleBold()}
            onitalic={() => editorRef!.toggleItalic()}
            onpromote={() => editorRef!.promoteHeading()}
            ondemote={() => editorRef!.demoteHeading()}
          />
        {/if}
        {#if showGraphicspathBanner}
          <div class="graphicspath-banner" role="alert">
            <span>Add <code>\graphicspath</code> to locate images in assets/</span>
            <button onclick={applyGraphicspath} aria-label="Add graphicspath">Add</button>
            <button
              onclick={() => {
                graphicspathBannerDismissed = true;
              }}>Dismiss</button
            >
          </div>
        {/if}
        <div
          class="editor-area"
          role="region"
          aria-label="Editor area"
          ondragover={(e) => e.preventDefault()}
          ondrop={handleDrop}
        >
          <EditorPane
            documentName={project.activePath}
            content={project.content}
            {dirty}
            {diagnostics}
            reveal={revealTarget}
            language={editorLanguage}
            keymapMode={editorPrefs.keymapMode}
            {spellChecker}
            citations={() => projectController.citeCandidates()}
            {viewMode}
            onedit={(content) => projectController.edit(content)}
            oncreate={(e) => {
              editorRef = e;
            }}
            oneditorscroll={handleEditorScroll}
            createEditor={editor}
          />
        </div>
        <ProblemsPanel {diagnostics} onjump={jumpToLine} />
        <OutlinePanel
          symbols={project.symbols}
          {includes}
          onjump={(line) => jumpToLine(line + 1)}
          onopenfile={(path) => void projectController.requestOpenFile(path)}
        />
        {#if searchOpen}
          <SearchPanel
            root={searchRoot}
            {backend}
            activeContent={project.content}
            activePath={project.activePath}
            onclose={() => (searchOpen = false)}
            onreplace={handleReplace}
          />
        {/if}
        <StatusBar content={project.content} />
      </div>
    </div>

    {#if !layout.previewCollapsed}
      <Resizer
        label="Resize preview"
        onresizestart={startPreviewResize}
        onresize={previewResize}
        onresizeend={endResize}
        onstep={stepPreview}
      />
      <div class="pane preview" style={previewStyle}>
        <PreviewPane
          status={project.compile.status}
          log={project.compile.log}
          pdf={project.compile.pdf}
          durationMs={project.compile.durationMs}
          cached={project.compile.cached}
          {highlightBox}
          syncScroll={previewPrefs.syncScroll}
          {editorScrollFraction}
          oninversesearch={handleInverseSearch}
          {createRenderer}
        />
      </div>
    {/if}
  </main>

  {#if paletteOpen}
    <CommandPalette actions={paletteActions} onclose={() => (paletteOpen = false)} />
  {/if}

  {#if settingsOpen}
    <Settings
      themePreference={preference}
      {reduceMotion}
      autoCompile={compilePrefs.autoCompile}
      soundOnSuccess={compilePrefs.soundOnSuccess}
      keymapMode={editorPrefs.keymapMode}
      spellCheck={editorPrefs.spellCheck}
      syncScroll={previewPrefs.syncScroll}
      onthemechange={changeTheme}
      onautocompilechange={changeAutoCompile}
      onsoundchange={changeSound}
      onkeymapchange={changeKeymapMode}
      onspellcheckchange={changeSpellCheck}
      onsyncscrollchange={changeSyncScroll}
      onclose={() => (settingsOpen = false)}
    />
  {/if}

  {#if project.pending !== null}
    <UnsavedGuard
      label={project.pending.label}
      onsave={() => void projectController.saveAndContinue()}
      ondiscard={() => void projectController.discardChanges()}
      oncancel={() => projectController.cancelPending()}
    />
  {/if}

  {#if mathOpen}
    <MathEditor
      setupField={mathFieldSetup}
      oninsert={insertMath}
      oncancel={() => (mathOpen = false)}
    />
  {/if}

  {#if tableOpen}
    <TableBuilder oninsert={insertTable} oncancel={() => (tableOpen = false)} />
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .workspace {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: stretch;
  }

  .pane {
    min-height: 0;
    overflow: hidden;
  }

  .pane.sidebar,
  .pane.preview {
    flex: none;
  }

  .pane.editor {
    flex: 1 1 auto;
    min-width: 0;
  }

  .editor-stack {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .editor-area {
    flex: 1 1 auto;
    min-height: 0;
  }

  .graphicspath-banner {
    display: flex;
    align-items: center;
    gap: var(--galley-space-3);
    padding: var(--galley-space-2) var(--galley-space-4);
    background: var(--surface);
    border-bottom: var(--galley-border-thin) solid var(--border);
    font-size: var(--galley-text-xs);
    color: var(--fg-muted);
    flex: none;
  }

  .graphicspath-banner span {
    flex: 1 1 auto;
  }

  .graphicspath-banner button {
    background: transparent;
    border: var(--galley-border-thin) solid var(--border);
    border-radius: 3px;
    color: var(--fg-muted);
    font-size: var(--galley-text-xs);
    padding: 2px var(--galley-space-2);
    cursor: pointer;
    flex: none;
  }

  .graphicspath-banner button:hover {
    color: var(--fg);
    border-color: var(--fg-faint);
  }
</style>
