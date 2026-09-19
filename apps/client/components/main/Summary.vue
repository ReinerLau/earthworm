<template>
  <div>
    <dialog
      className="modal mt-[-8vh]"
      :open="showModal"
    >
      <div className="modal-box max-w-[48rem]">
        <div class="relative">
          <h3 className="font-bold text-lg mb-4">🎉 Congratulations!</h3>
          <button
            v-if="!courseStore.isOffline"
            tabindex="0"
            class="btn btn-ghost btn-sm absolute right-0 top-0 mx-1 h-7 w-7 rounded-md p-0"
            @click="soundSentence"
          >
            <span class="i-ph-speaker-simple-high h-full w-full"></span>
          </button>
        </div>

        <div class="flex flex-col">
          <div
            v-if="!courseStore.isOffline"
            class="flex"
          >
            <span class="text-6xl font-bold">"</span>
            <div class="flex-1 text-center text-xl leading-loose">
              {{ enSentence }}
            </div>
            <span class="invisible text-6xl font-bold">"</span>
          </div>

          <div
            v-if="!courseStore.isOffline"
            class="flex"
          >
            <span class="invisible text-6xl font-bold">"</span>
            <div class="flex-1 text-center text-xl leading-loose">
              {{ zhSentence }}
            </div>
            <span class="text-6xl font-bold">"</span>
          </div>
          <p
            v-if="!courseStore.isOffline"
            class="text-3 text-right text-gray-200"
          >
            —— 金山词霸「每日一句」
          </p>
          <p class="pl-14 text-base leading-loose text-gray-600">
            {{
              `恭喜您一共完成 ${courseTimer.totalRecordNumber()} 道题，用时 ${formatSecondsToTime(
                courseTimer.calculateTotalTime(),
              )} `
            }}
          </p>
        </div>
        <div className="modal-action">
          <button
            v-if="!courseStore.isOffline"
            class="btn btn-primary"
            @click="toShare"
          >
            生成打卡图
          </button>
          <button
            class="btn"
            @click="handleDoAgain"
          >
            再来一次
          </button>

          <button
            class="btn"
            @click="goToNextCourse"
          >
            返回课程列表
            <kbd class="kbd"> ↵ </kbd>
          </button>
        </div>
      </div>
      <canvas
        ref="confettiCanvasRef"
        class="pointer-events-none absolute left-0 top-0 h-full w-full"
      ></canvas>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from "#app";
import { watch } from "vue";

import { courseTimer } from "~/composables/courses/courseTimer";
import { useConfetti } from "~/composables/main/confetti/useConfetti";
import { useGameMode } from "~/composables/main/game";
import { useShareModal } from "~/composables/main/shareImage/share";
import { useSummary } from "~/composables/main/summary";
import { useCourseStore } from "~/store/course";
import { permitSaveStatement, preventSaveStatement } from "~/store/statement";
import { formatSecondsToTime } from "~/utils/date";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";

const courseStore = useCourseStore();
const { goToNextCourse, completeCourse } = useCourse();
const { handleDoAgain } = useDoAgain();
const { showModal, hideSummary } = useSummary();
const { confettiCanvasRef, playConfetti } = useConfetti();
const { showShareModal } = useShareModal();

watch(showModal, (val) => {
  if (val) {
    // 阻止包含 statement 完成课程后会自动把用户的进度设置成下一课
    // 这里是为了防止先设置成下一课 后更新了 statement 的进度
    // 这就会造成获取用户最近的课程包进度出现错误  因为是基于时间来获取的
    preventSaveStatement();
    // 注册回车键进入下一课
    registerShortcut("enter", goToNextCourse);
    // 显示结算面板代表当前课程已经完成
    completeCourse();
    // 延迟一小会放彩蛋
    setTimeout(async () => {
      playConfetti();
    }, 300);
  } else {
    // 取消回车键进入下一课
    cancelShortcut("enter", goToNextCourse);
    // 从显示状态关闭结算面板
    courseStore.resetStatementIndex();
    permitSaveStatement();
  }
});

function useDoAgain() {
  const { showQuestion } = useGameMode();

  function handleDoAgain() {
    courseStore.doAgain();
    hideSummary();
    showQuestion();
    courseTimer.reset();
  }

  return {
    handleDoAgain,
  };
}

function useCourse() {
  async function goToNextCourse() {
    hideSummary();
    navigateTo(`/course-pack/${courseStore.currentCourse?.coursePackId}`);
  }

  async function completeCourse() {
    if (courseStore.currentCourse) {
      await courseStore.completeCourse();
    }
  }

  return {
    completeCourse,
    goToNextCourse,
  };
}

const toShare = () => {
  showShareModal();
};
</script>
