<script setup lang="ts">
import { navigateTo } from "#app";
import { onMounted } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

onMounted(() => {
  void navigateTo({ path: "/receive", query: route.query }, { replace: true });
});
</script>

<template>
  <p class="p-8 text-center">正在打开课程接收页面…</p>
</template>
