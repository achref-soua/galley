<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Logo from './Logo.svelte';

  const { Story } = defineMeta({
    title: 'Brand/Logo',
    component: Logo
  });
</script>

<Story name="Default">
  <Logo />
</Story>

<Story name="Large">
  <Logo size={96} />
</Story>
