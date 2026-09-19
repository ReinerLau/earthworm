<template>
  <span
    class="hidden"
    aria-hidden="true"
  ></span>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";

import { useAnswerTip } from "~/composables/main/answerTip";
import { useCurrentStatementEnglishSound } from "~/composables/main/englishSound";
import { useGameMode } from "~/composables/main/game";
import { useSummary } from "~/composables/main/summary";
import { useShortcutKeyMode } from "~/composables/user/shortcutKey";
import { useCourseStore } from "~/store/course";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";

const { shortcutKeys } = useShortcutKeyMode();
usePlaySound(shortcutKeys.value.sound);
useShowAnswer(shortcutKeys.value.answer);

useQuestionNavigation();

function usePlaySound(key: string) {
  const { playSound } = useCurrentStatementEnglishSound();

  onMounted(() => {
    registerShortcut(key, playSoundCommand);
  });

  onUnmounted(() => {
    cancelShortcut(key, playSoundCommand);
  });

  function playSoundCommand(e: KeyboardEvent) {
    e.preventDefault();
    playSound();
  }
}

function useQuestionNavigation() {
  const courseStore = useCourseStore();
  const { showQuestion } = useGameMode();

  function goToPreviousQuestion(event: KeyboardEvent) {
    event.preventDefault();
    if (courseStore.statementIndex === 0) return;
    courseStore.toPreviousStatement();
    showQuestion();
  }

  function goToNextQuestion(event: KeyboardEvent) {
    event.preventDefault();
    if (courseStore.statementIndex >= courseStore.totalQuestionsCount - 1) return;
    courseStore.toNextStatement();
    showQuestion();
  }

  onMounted(() => {
    registerShortcut("ArrowLeft", goToPreviousQuestion);
    registerShortcut("ArrowRight", goToNextQuestion);
  });

  onUnmounted(() => {
    cancelShortcut("ArrowLeft", goToPreviousQuestion);
    cancelShortcut("ArrowRight", goToNextQuestion);
  });
}

function useShowAnswer(key: string) {
  const { showQuestion } = useGameMode();
  const { showAnswerTip, hiddenAnswerTip } = useAnswerTip();

  onMounted(() => {
    registerShortcut(key, handleShowAnswer);
  });

  onUnmounted(() => {
    cancelShortcut(key, handleShowAnswer);
  });

  function handleShowAnswer(e: KeyboardEvent) {
    e.preventDefault();
    toggleGameMode();
  }

  function toggleGameMode() {
    // NOTE: registerShortcut 事件会记住注册时的面板状态，所以这里要重新获取下面板信息
    const { showModal } = useSummary();
    if (showModal.value) {
      // 结算面板不做切换处理
      return;
    }

    const { isAnswer } = useGameMode();
    const { isAnswerTip } = useAnswerTip();
    if (isAnswer()) {
      showQuestion();
    } else {
      if (isAnswerTip()) {
        hiddenAnswerTip();
      } else {
        showAnswerTip();
      }
    }
  }
}
</script>
