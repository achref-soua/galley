<script lang="ts">
  import { type ThemePreference } from '@galley/ui-kit';
  import { ThemeController, browserThemeEnv } from './lib/theme';
  import { LayoutController } from './lib/layout-store';
  import { prefersReducedMotion } from './lib/motion';
  import Titlebar from './lib/Titlebar.svelte';
  import Sidebar from './lib/Sidebar.svelte';
  import EditorPane from './lib/EditorPane.svelte';
  import PreviewPane from './lib/PreviewPane.svelte';
  import Resizer from './lib/Resizer.svelte';
  import Settings from './lib/Settings.svelte';

  const RESIZE_STEP = 16;

  const theme = new ThemeController(browserThemeEnv());
  const layoutController = new LayoutController(window.localStorage);

  let preference = $state<ThemePreference>(theme.preference);
  let layout = $state(layoutController.state);
  let settingsOpen = $state(false);
  const reduceMotion = prefersReducedMotion();

  let resizeBaseline = 0;

  const sidebarStyle = $derived(`width: ${layout.sidebarWidth}px`);
  const previewStyle = $derived(`width: ${layout.previewWidth}px`);

  function changeTheme(pref: ThemePreference) {
    theme.setPreference(pref);
    preference = pref;
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

<div class="app">
  <Titlebar
    documentName="untitled.tex"
    sidebarCollapsed={layout.sidebarCollapsed}
    previewCollapsed={layout.previewCollapsed}
    ontogglesidebar={toggleSidebar}
    ontogglepreview={togglePreview}
    onopensettings={() => (settingsOpen = true)}
  />

  <main class="workspace">
    {#if !layout.sidebarCollapsed}
      <div class="pane sidebar" style={sidebarStyle}>
        <Sidebar />
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
      <EditorPane />
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
