<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Wordmark from './Wordmark.svelte';

  const { Story } = defineMeta({
    title: 'Brand/Wordmark',
    component: Wordmark
  });
</script>

<Story name="Default">
  <Wordmark />
</Story>

<Story name="With tagline">
  <Wordmark tagline />
</Story>
