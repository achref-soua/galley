<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Icon from './Icon.svelte';

  const { Story } = defineMeta({
    title: 'Primitives/Icon',
    component: Icon
  });
</script>

<Story name="Panel left">
  <Icon name="panel-left" label="Sidebar" />
</Story>

<Story name="Panel right">
  <Icon name="panel-right" label="Preview" />
</Story>

<Story name="Settings">
  <Icon name="settings" label="Settings" />
</Story>

<Story name="Close">
  <Icon name="close" label="Close" />
</Story>
