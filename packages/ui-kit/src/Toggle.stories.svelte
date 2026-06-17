<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Toggle from './Toggle.svelte';

  const { Story } = defineMeta({
    title: 'Primitives/Toggle',
    component: Toggle
  });
</script>

<Story name="Off">
  <Toggle label="Key sound" />
</Story>

<Story name="On">
  <Toggle label="Key sound" checked />
</Story>
