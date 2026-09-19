import type { Ref } from "vue";

import { debounce } from "lodash-es";
import { ref, watch } from "vue";

import type { Course } from "./course";

const DEBOUNCE_TIME = 5000;
const INTERVAL_TIME = 60 * 1000 * 5;

let lastSavedIndex = 0;
let isSaveStatement = true;
const statementIndex = ref(0);

interface StatementSetupOptions {
  saveProgress?: (statementIndex: number) => void | Promise<void>;
}

let stopCurrentWatch: (() => void) | undefined;
let currentInterval: ReturnType<typeof setInterval> | undefined;
let cleanupCurrent: (() => void) | undefined;

export function useStatement() {
  function setupStatement(course: Ref<Course | undefined>, options: StatementSetupOptions = {}) {
    stopCurrentWatch?.();
    cleanupCurrent?.();
    if (currentInterval) clearInterval(currentInterval);
    statementIndex.value = course.value!.statementIndex || 0;
    lastSavedIndex = statementIndex.value;

    const debouncedSaveProgress = debounce(() => {
      saveProgress();

      lastSavedIndex = statementIndex.value;
    }, DEBOUNCE_TIME);

    watch(
      () => statementIndex.value,
      () => {
        if (options.saveProgress) {
          debouncedSaveProgress();
        }
      },
    );

    stopCurrentWatch = () => debouncedSaveProgress.cancel();

    // 窗口关闭前保存
    const handleBeforeUnload = () => saveProgress();
    window.addEventListener("beforeunload", handleBeforeUnload);

    // 页面失去焦点时保存
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveProgress();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    cleanupCurrent = () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };

    // 设置间隔性自动保存
    currentInterval = setInterval(() => {
      saveProgress();
    }, INTERVAL_TIME); // 每5分钟自动保存一次

    function saveProgress() {
      if (!isSaveStatement) return;

      if (statementIndex.value !== lastSavedIndex) {
        void options.saveProgress?.(statementIndex.value);
        lastSavedIndex = statementIndex.value;
      }
    }
  }

  return {
    setupStatement,
    statementIndex,
  };
}

export function permitSaveStatement() {
  isSaveStatement = true;
}

export function preventSaveStatement() {
  isSaveStatement = false;
}
