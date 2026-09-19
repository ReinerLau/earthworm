<template>
  <div
    class="card w-72 shrink-0 cursor-pointer bg-base-100 shadow-xl"
    @click="handleGoToCoursePack(coursePack)"
  >
    <figure>
      <NuxtImg
        :src="coursePack.cover || '/logo.png'"
        :placeholder="[288, 180]"
        width="288"
        height="180"
        class="rounded"
      />
    </figure>
    <div class="card-body">
      <h2 class="card-title">{{ coursePack.title }}</h2>
      <p>{{ coursePack.description }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from "#imports";

import type { LocalCoursePack } from "~/services/courseRepository";

interface Props {
  coursePack: LocalCoursePack;
}

defineProps<Props>();

function handleGoToCoursePack(coursePack: LocalCoursePack) {
  navigateTo(`/course-pack/${coursePack.id}`);
}
</script>
