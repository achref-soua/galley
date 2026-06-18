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
  import { CompilePrefsStore } from './lib/settings-store';
  import { EditorPrefsStore, type EditorPrefs, type KeymapMode } from './lib/keymap-prefs';
  import { type SpellChecker, buildSpellChecker } from './lib/spell-check';
  import {
    createLatexEditor,
    type EditorFactory,
    type LanguageContext,
    type RevealRequest
  } from './lib/editor';
  import { pdfjsRenderer, type PdfRenderer } from './lib/pdf';
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
  import Titlebar from './lib/Titlebar.svelte';
  import Sidebar from './lib/Sidebar.svelte';
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
    language = selectLanguageBackend()
  }: {
    editor?: EditorFactory;
    createRenderer?: () => PdfRenderer;
    compileTimer?: Timer;
    compileClock?: Clock;
    bell?: Bell;
    language?: LanguageBackend;
  } = $props();

  const RESIZE_STEP = 16;

  const theme = new ThemeController(browserThemeEnv());
  const layoutController = new LayoutController(window.localStorage);
  const prefsStore = new CompilePrefsStore(window.localStorage);
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
        language
      })
  );

  let preference = $state<ThemePreference>(theme.preference);
  let layout = $state(layoutController.state);
  let settingsOpen = $state(false);
  let paletteOpen = $state(false);
  let searchOpen = $state(false);
  let project = $state(projectController.state);
  let compilePrefs = $state(prefsStore.prefs);
  let editorPrefs = $state<EditorPrefs>(editorPrefsStore.prefs);
  let spellChecker = $state<SpellChecker | null>(null);
  let revealTarget = $state<RevealRequest | null>(null);
  projectController.subscribe((state) => (project = state));
  editorPrefsStore.subscribe((prefs) => {
    editorPrefs = prefs;
  });
  const reduceMotion = prefersReducedMotion();
  let searchRoot = $state<string | null>(null);
  $effect(() => {
    searchRoot = project.project == null ? null : project.project.root;
  });

  let resizeBaseline = 0;
  // A monotonic stamp so clicking the same problem twice still re-jumps.
  let revealNonce = 0;

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
    } else if (isCompileShortcut(event)) {
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

  function handleReplace(path: string, newContent: string) {
    if (path === project.activePath) {
      projectController.edit(newContent);
    }
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
    oncompile={() => void projectController.compile()}
    onsave={() => void projectController.save()}
    ontogglesidebar={toggleSidebar}
    ontogglepreview={togglePreview}
    onopensettings={() => (settingsOpen = true)}
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
        <div class="editor-area">
          <EditorPane
            documentName={project.activePath}
            content={project.content}
            {dirty}
            {diagnostics}
            reveal={revealTarget}
            language={editorLanguage}
            keymapMode={editorPrefs.keymapMode}
            {spellChecker}
            onedit={(content) => projectController.edit(content)}
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
      onthemechange={changeTheme}
      onautocompilechange={changeAutoCompile}
      onsoundchange={changeSound}
      onkeymapchange={changeKeymapMode}
      onspellcheckchange={changeSpellCheck}
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
</style>
