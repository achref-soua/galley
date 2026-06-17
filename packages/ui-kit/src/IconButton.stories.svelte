<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import IconButton from './IconButton.svelte';
  import Icon from './Icon.svelte';

  const { Story } = defineMeta({
    title: 'Primitives/IconButton',
    component: IconButton
  });
</script>

<Story name="Action">
  <IconButton label="Settings">
    <Icon name="settings" />
  </IconButton>
</Story>

<Story name="Pressed toggle">
  <IconButton label="Sidebar" pressed>
    <Icon name="panel-left" />
  </IconButton>
</Story>
