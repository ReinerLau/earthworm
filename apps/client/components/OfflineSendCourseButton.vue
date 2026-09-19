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
          用手机系统相机扫描一次二维码，浏览器打开后会自动接收当前课程。
        </p>
        <img
          v-if="qrDataUrl"
          class="mx-auto my-5 h-64 w-64 rounded-lg bg-white p-3"
          :src="qrDataUrl"
          alt="发送到 iPhone 的二维码"
        />
        <label
          class="block text-left text-sm font-semibold"
          for="offline-transfer-link"
          >也可以复制同步链接到手机</label
        >
        <div class="join mt-2 w-full">
          <input
            id="offline-transfer-link"
            class="input join-item input-bordered min-w-0 flex-1 text-xs"
            :value="receiverLink"
            type="url"
            readonly
            aria-label="课程同步链接"
          />
          <button
            class="btn join-item"
            type="button"
            :disabled="!receiverLink"
            @click="copyReceiverLink"
          >
            复制链接
          </button>
        </div>
        <p
          v-if="copyMessage"
          class="mt-2 text-left text-sm opacity-70"
          aria-live="polite"
        >
          {{ copyMessage }}
        </p>
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
import { getCoursePack, toCoursePackage } from "~/services/courseRepository";
import { useCourseStore } from "~/store/course";
import { createTransferReceiverUrl } from "~/utils/transferReceiverUrl";

const courseStore = useCourseStore();
const runtimeConfig = useRuntimeConfig();
const showModal = ref(false);
const isBusy = ref(false);
const hasError = ref(false);
const status = ref<TransferStatus>("idle");
const statusMessage = ref("准备二维码");
const roomToken = ref("");
const qrDataUrl = ref("");
const receiverLink = ref("");
const copyMessage = ref("");
let session: TransferSession | undefined;

const statusClass = computed(() => {
  if (status.value === "error") return "text-error";
  if (status.value === "completed") return "text-success";
  return "";
});

function receiverUrl(token: string): string {
  const signalUrl = String(runtimeConfig.public.signalBaseUrl || "");
  const appBaseUrl = new URL(
    String(runtimeConfig.public.appBaseURL || "/"),
    window.location.origin,
  );
  return createTransferReceiverUrl({
    appUrl: new URL("receive", appBaseUrl).toString(),
    signalUrl,
    roomToken: token,
  });
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
  receiverLink.value = "";
  copyMessage.value = "";
  const signalUrl = String(runtimeConfig.public.signalBaseUrl || "");
  if (!signalUrl) {
    updateStatus({ status: "error", message: "未配置 Cloudflare 信令地址" });
    return;
  }
  try {
    receiverLink.value = receiverUrl(roomToken.value);
    qrDataUrl.value = makeQr(receiverLink.value);
    session = createTransferSession({
      role: "sender",
      signalUrl,
      roomToken: roomToken.value,
      onStatus: updateStatus,
    });
    await session.connect();
    if (!courseStore.currentCourse) throw new Error("当前没有可发送的课程");
    const coursePack = await getCoursePack(courseStore.currentCourse.coursePackId);
    if (!coursePack) throw new Error("本机没有找到当前课程包");
    await session.sendCoursePackage(toCoursePackage(coursePack));
  } catch (error) {
    session?.close();
    session = undefined;
    updateStatus({ status: "error", message: error instanceof Error ? error.message : "连接失败" });
  }
}

async function copyReceiverLink(): Promise<void> {
  if (!receiverLink.value) return;

  try {
    await navigator.clipboard.writeText(receiverLink.value);
    copyMessage.value = "已复制同步链接，请在手机端粘贴";
  } catch {
    copyMessage.value = "复制失败，请手动选择上方链接复制";
  }
}

function closeTransfer(): void {
  session?.close();
  session = undefined;
  isBusy.value = false;
  showModal.value = false;
  receiverLink.value = "";
  copyMessage.value = "";
}

onUnmounted(closeTransfer);
</script>
