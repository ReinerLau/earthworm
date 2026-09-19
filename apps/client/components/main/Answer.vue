<template>
  <div class="text-center">
    <div class="ml-8 inline-flex flex-wrap items-center gap-1 text-5xl">
      <span
        v-for="word in words"
        :key="word"
        class="p-1"
        >{{ word }}</span
      >
    </div>
    <div class="my-6 text-xl text-gray-500">
      {{ courseStore.currentStatement?.soundmark }}
    </div>
    <div class="my-6 text-xl text-gray-500">
      {{ courseStore.currentStatement?.chinese }}
    </div>
    <button
      class="btn btn-outline btn-sm"
      @click="showQuestion"
    >
      再来一次
    </button>
    <button
      class="btn btn-outline btn-sm ml-6"
      @click="goToNextQuestion"
    >
      下一题
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";

import { useGameMode } from "~/composables/main/game";
import { useSummary } from "~/composables/main/summary";
import { useCourseStore } from "~/store/course";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";

const courseStore = useCourseStore();
const { showSummary } = useSummary();
const { showQuestion } = useGameMode();

const words = computed(() => courseStore.currentStatement?.english.split(" "));

registerShortcutKeyForNextQuestion();

function registerShortcutKeyForNextQuestion() {
  function handleKeydown(e: KeyboardEvent) {
    e.preventDefault(); // 阻止到下一个页面的默认按键动作
    goToNextQuestion();
  }
  onMounted(() => {
    registerShortcut(" ", handleKeydown);
    registerShortcut("enter", handleKeydown);
  });

  onUnmounted(() => {
    cancelShortcut(" ", handleKeydown);
    cancelShortcut("enter", handleKeydown);
  });
}

function goToNextQuestion() {
  if (courseStore.isAllDone()) {
    showSummary();
    return;
  }

  courseStore.toNextStatement();
  showQuestion();
}
</script>
