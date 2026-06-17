<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Panel from './Panel.svelte';

  const { Story } = defineMeta({
    title: 'Primitives/Panel',
    component: Panel
  });
</script>

<Story name="Titled">
  <div style="height: 220px; width: 280px;">
    <Panel title="Project">
      <p style="padding: 1rem;">No project open yet.</p>
    </Panel>
  </div>
</Story>

<Story name="Untitled">
  <div style="height: 220px; width: 280px;">
    <Panel>
      <p style="padding: 1rem;">A bare surface.</p>
    </Panel>
  </div>
</Story>
