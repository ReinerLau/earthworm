<template>
  <NuxtLayout :name="isOffline ? 'offline' : 'default'">
    <div class="flex w-full flex-col pt-2">
      <template v-if="isLoading">
        <Loading></Loading>
      </template>
      <template v-else>
        <MainTool />
        <MainGame />
      </template>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import { useGameMode } from "~/composables/main/game";
import { useCourseStore } from "~/store/course";

definePageMeta({ layout: false });

const isLoading = ref(true);
const route = useRoute();
const coursesStore = useCourseStore();
const { showQuestion } = useGameMode();
const isOffline = route.query.offline === "1";

showQuestion();

onMounted(async () => {
  const { coursePackId, id } = route.params;
  if (isOffline) {
    await coursesStore.setupOffline(coursePackId as string, id as string);
  } else {
    await coursesStore.setup(coursePackId as string, id as string);
  }

  isLoading.value = false;
});
</script>
