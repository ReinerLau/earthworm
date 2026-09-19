<template>
  <div>
    <button
      class="btn btn-ghost btn-sm h-8 rounded-md px-2"
      :disabled="isBusy"
      @click="openTransfer"
    >
      <span class="i-ph-device-mobile-camera h-5 w-5"></span>
      <span class="hidden sm:inline">发送到 iPhone</span>
    </button>

    <dialog
      class="modal"
      :open="showModal"
    >
      <div class="modal-box max-w-md text-center">
        <h3 class="text-lg font-bold">发送到 iPhone</h3>
        <p class="mt-2 text-sm opacity-70">
          用 iPhone 扫描一次二维码，连接成功后会自动发送当前课程。
        </p>
        <img
          v-if="qrDataUrl"
          class="mx-auto my-5 h-64 w-64 rounded-lg bg-white p-3"
          :src="qrDataUrl"
          alt="发送到 iPhone 的二维码"
        />
        <p class="break-all text-xs opacity-60">{{ roomToken }}</p>
        <p
          class="mt-4 text-sm"
          :class="statusClass"
        >
          {{ statusMessage }}
        </p>
        <div class="modal-action justify-center">
          <button
            class="btn"
            @click="closeTransfer"
          >
            关闭
          </button>
          <button
            v-if="hasError"
            class="btn btn-primary"
            @click="openTransfer"
          >
            重新创建房间
          </button>
        </div>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { useRuntimeConfig } from "nuxt/app";
import qrcode from "qrcode-generator";
import { computed, onUnmounted, ref } from "vue";

import type { TransferSession, TransferStatus } from "@earthworm/course-transfer";
import { createRoomToken, createTransferSession } from "@earthworm/course-transfer";
import { useCourseStore } from "~/store/course";

const courseStore = useCourseStore();
const runtimeConfig = useRuntimeConfig();
const showModal = ref(false);
const isBusy = ref(false);
const hasError = ref(false);
const status = ref<TransferStatus>("idle");
const statusMessage = ref("准备二维码");
const roomToken = ref("");
const qrDataUrl = ref("");
let session: TransferSession | undefined;

const statusClass = computed(() => {
  if (status.value === "error") return "text-error";
  if (status.value === "completed") return "text-success";
  return "";
});

function receiverUrl(token: string): string {
  const signalUrl = String(runtimeConfig.public.signalBaseUrl || "");
  const pwaUrl = String(
    runtimeConfig.public.pwaUrl || `${window.location.origin}${runtimeConfig.app.baseURL}`,
  ).replace(/\/$/, "");
  const url = new URL(`${pwaUrl}/`);
  url.hash = `/offline/receive?signal=${encodeURIComponent(signalUrl)}&room=${token}`;
  return url.toString();
}

function makeQr(url: string): string {
  const code = qrcode(0, "M");
  code.addData(url);
  code.make();
  return code.createDataURL(6, 8);
}

function updateStatus(event: { status: TransferStatus; message?: string }): void {
  status.value = event.status;
  statusMessage.value =
    event.message ||
    {
      idle: "准备二维码",
      signaling: "连接信令服务…",
      "peer-ready": "iPhone 已加入，正在建立连接…",
      negotiating: "正在建立点对点连接…",
      connected: "连接成功，正在发送课程…",
      transferring: "正在发送课程…",
      completed: "课程已保存到 iPhone",
      closed: "连接已关闭",
      error: "连接失败",
    }[event.status];
  hasError.value = event.status === "error";
  if (event.status === "completed" || event.status === "error") isBusy.value = false;
}

async function openTransfer(): Promise<void> {
  closeTransfer();
  showModal.value = true;
  isBusy.value = true;
  hasError.value = false;
  status.value = "idle";
  statusMessage.value = "准备二维码";
  roomToken.value = createRoomToken();
  const signalUrl = String(runtimeConfig.public.signalBaseUrl || "");
  if (!signalUrl) {
    updateStatus({ status: "error", message: "未配置 Cloudflare 信令地址" });
    return;
  }
  try {
    qrDataUrl.value = makeQr(receiverUrl(roomToken.value));
    session = createTransferSession({
      role: "sender",
      signalUrl,
      roomToken: roomToken.value,
      onStatus: updateStatus,
    });
    await session.connect();
    if (courseStore.currentCourse) await session.sendCourse(courseStore.currentCourse);
  } catch (error) {
    session?.close();
    session = undefined;
    updateStatus({ status: "error", message: error instanceof Error ? error.message : "连接失败" });
  }
}

function closeTransfer(): void {
  session?.close();
  session = undefined;
  isBusy.value = false;
  showModal.value = false;
}

onUnmounted(closeTransfer);
</script>
