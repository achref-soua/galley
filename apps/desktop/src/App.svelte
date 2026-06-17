<script lang="ts">
  import { untrack } from 'svelte';
  import { type ThemePreference } from '@galley/ui-kit';
  import { ThemeController, browserThemeEnv } from './lib/theme';
  import { LayoutController } from './lib/layout-store';
  import { prefersReducedMotion } from './lib/motion';
  import { ProjectController } from './lib/project-store';
  import { selectBackend } from './lib/project-backend';
  import { RecentProjectsStore } from './lib/recent-projects';
  import { CompilePrefsStore } from './lib/settings-store';
  import { createLatexEditor, type EditorFactory } from './lib/editor';
  import { pdfjsRenderer, type PdfRenderer } from './lib/pdf';
  import { windowTimer, type Timer } from './lib/debounce';
  import { systemClock, type Clock } from './lib/timing';
  import { webAudioBell, type Bell } from './lib/bell';
  import { isCompileShortcut, isSaveShortcut } from './lib/keymap';
  import Titlebar from './lib/Titlebar.svelte';
  import Sidebar from './lib/Sidebar.svelte';
  import EditorPane from './lib/EditorPane.svelte';
  import PreviewPane from './lib/PreviewPane.svelte';
  import Resizer from './lib/Resizer.svelte';
  import Settings from './lib/Settings.svelte';
  import UnsavedGuard from './lib/UnsavedGuard.svelte';

  // The editor, PDF renderer, and compile timing/sound are injectable so tests
  // can drive the UI with fakes; the packaged app uses the real CodeMirror
  // editor, PDF.js renderer, debounce timer, clock, and Web Audio bell.
  let {
    editor = createLatexEditor,
    createRenderer = pdfjsRenderer,
    compileTimer = windowTimer(),
    compileClock = systemClock(),
    bell = webAudioBell()
  }: {
    editor?: EditorFactory;
    createRenderer?: () => PdfRenderer;
    compileTimer?: Timer;
    compileClock?: Clock;
    bell?: Bell;
  } = $props();

  const RESIZE_STEP = 16;

  const theme = new ThemeController(browserThemeEnv());
  const layoutController = new LayoutController(window.localStorage);
  const prefsStore = new CompilePrefsStore(window.localStorage);
  // The injected timer/clock/bell are construction-time configuration, not
  // reactive inputs, so read their initial values untracked.
  const projectController = untrack(
    () =>
      new ProjectController(selectBackend(), new RecentProjectsStore(window.localStorage), {
        timer: compileTimer,
        clock: compileClock,
        bell,
        autoCompile: prefsStore.prefs.autoCompile,
        soundOnSuccess: prefsStore.prefs.soundOnSuccess
      })
  );

  let preference = $state<ThemePreference>(theme.preference);
  let layout = $state(layoutController.state);
  let settingsOpen = $state(false);
  let project = $state(projectController.state);
  let compilePrefs = $state(prefsStore.prefs);
  projectController.subscribe((state) => (project = state));
  const reduceMotion = prefersReducedMotion();

  let resizeBaseline = 0;

  const sidebarStyle = $derived(`width: ${layout.sidebarWidth}px`);
  const previewStyle = $derived(`width: ${layout.previewWidth}px`);
  const documentName = $derived(project.activePath ?? 'No document');
  const dirty = $derived(project.activePath !== null && project.content !== project.savedContent);
  const canCompile = $derived(project.activePath !== null);
  const compiling = $derived(project.compile.status === 'running');

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

  function onWindowKeydown(event: KeyboardEvent) {
    if (isSaveShortcut(event)) {
      event.preventDefault();
      void projectController.save();
    } else if (isCompileShortcut(event)) {
      event.preventDefault();
      void projectController.compile();
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
      <EditorPane
        documentName={project.activePath}
        content={project.content}
        {dirty}
        onedit={(content) => projectController.edit(content)}
        createEditor={editor}
      />
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

  {#if settingsOpen}
    <Settings
      themePreference={preference}
      {reduceMotion}
      autoCompile={compilePrefs.autoCompile}
      soundOnSuccess={compilePrefs.soundOnSuccess}
      onthemechange={changeTheme}
      onautocompilechange={changeAutoCompile}
      onsoundchange={changeSound}
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
</style>
