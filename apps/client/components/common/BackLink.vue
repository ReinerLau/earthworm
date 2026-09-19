<template>
  <NuxtLink
    :to="to"
    :aria-label="label"
    class="btn btn-primary min-h-11 gap-2 px-4 text-base"
  >
    <span
      class="i-ph-arrow-left h-5 w-5"
      aria-hidden="true"
    ></span>
    <span>{{ label }}</span>
  </NuxtLink>
</template>

<script setup lang="ts">
interface Props {
  label: string;
  to: string;
}

defineProps<Props>();
</script>
