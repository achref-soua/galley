<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Button from './Button.svelte';

  const { Story } = defineMeta({
    title: 'Primitives/Button',
    component: Button
  });
</script>

<Story name="Default">
  <Button>Compile</Button>
</Story>

<Story name="Primary">
  <Button variant="primary">Pull a proof</Button>
</Story>

<Story name="Ghost">
  <Button variant="ghost">Cancel</Button>
</Story>

<Story name="Small">
  <Button size="sm">Recompile</Button>
</Story>

<Story name="Disabled">
  <Button disabled>Unavailable</Button>
</Story>
