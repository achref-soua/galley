<script lang="ts">
  import { type ThemePreference } from '@galley/ui-kit';
  import { ThemeController, browserThemeEnv } from './lib/theme';
  import { LayoutController } from './lib/layout-store';
  import { prefersReducedMotion } from './lib/motion';
  import { ProjectController } from './lib/project-store';
  import { selectBackend } from './lib/project-backend';
  import { RecentProjectsStore } from './lib/recent-projects';
  import { isSaveShortcut } from './lib/keymap';
  import Titlebar from './lib/Titlebar.svelte';
  import Sidebar from './lib/Sidebar.svelte';
  import EditorPane from './lib/EditorPane.svelte';
  import PreviewPane from './lib/PreviewPane.svelte';
  import Resizer from './lib/Resizer.svelte';
  import Settings from './lib/Settings.svelte';
  import UnsavedGuard from './lib/UnsavedGuard.svelte';

  const RESIZE_STEP = 16;

  const theme = new ThemeController(browserThemeEnv());
  const layoutController = new LayoutController(window.localStorage);
  const projectController = new ProjectController(
    selectBackend(),
    new RecentProjectsStore(window.localStorage)
  );

  let preference = $state<ThemePreference>(theme.preference);
  let layout = $state(layoutController.state);
  let settingsOpen = $state(false);
  let project = $state(projectController.state);
  projectController.subscribe((state) => (project = state));
  const reduceMotion = prefersReducedMotion();

  let resizeBaseline = 0;

  const sidebarStyle = $derived(`width: ${layout.sidebarWidth}px`);
  const previewStyle = $derived(`width: ${layout.previewWidth}px`);
  const documentName = $derived(project.activePath ?? 'No document');
  const dirty = $derived(project.activePath !== null && project.content !== project.savedContent);

  function changeTheme(pref: ThemePreference) {
    theme.setPreference(pref);
    preference = pref;
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (isSaveShortcut(event)) {
      event.preventDefault();
      void projectController.save();
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
    sidebarCollapsed={layout.sidebarCollapsed}
    previewCollapsed={layout.previewCollapsed}
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
        <PreviewPane />
      </div>
    {/if}
  </main>

  {#if settingsOpen}
    <Settings
      themePreference={preference}
      {reduceMotion}
      onthemechange={changeTheme}
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
