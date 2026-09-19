import { onMounted, ref } from "vue";

import { fetchDailySentence } from "~/api/tool";

const showModal = ref(false);
export function useSummary() {
  function showSummary() {
    showModal.value = true;
  }

  function hideSummary() {
    showModal.value = false;
  }

  return {
    showModal,
    showSummary,
    hideSummary,
  };
}

export const defaultEnSentence = "To be, or not to be, that is the question.";
export const defaultZhSentence = "生存还是毁灭，这是一个问题。";

const enSentence = ref(defaultEnSentence);
const zhSentence = ref(defaultZhSentence);
const hasLoadingDailySentence = ref(false);

export const resetSentenceLoading = () => (hasLoadingDailySentence.value = false);

export function useDailySentence(isOffline = false) {
  const getDailySentence = async () => {
    if (isOffline) return;
    if (!hasLoadingDailySentence.value) {
      hasLoadingDailySentence.value = true;
      const { en, zh } = await fetchDailySentence().catch((err) => {
        hasLoadingDailySentence.value = false;
        return Promise.reject(err);
      });
      enSentence.value = en;
      zhSentence.value = zh;
    }
  };

  onMounted(() => {
    if (!isOffline) getDailySentence();
  });

  return {
    enSentence,
    zhSentence,
    getDailySentence,
  };
}
