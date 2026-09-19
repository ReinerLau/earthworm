<template>
  <section class="py-12 text-center">
    <div class="mb-6 text-5xl">🪱</div>
    <h1 class="text-2xl font-bold">接收课程</h1>
    <p
      class="mt-3 text-sm opacity-70"
      :class="status === 'error' ? 'text-error' : ''"
    >
      {{ message }}
    </p>
    <div
      v-if="status === 'error'"
      class="mt-8 flex justify-center gap-2"
    >
      <NuxtLink
        class="btn btn-primary"
        to="/offline/"
      >
        查看本机课程
      </NuxtLink>
      <button
        class="btn"
        @click="connect"
      >
        重试
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { navigateTo } from "#app";
import { onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";

import type { TransferSession, TransferStatus } from "@earthworm/course-transfer";
import { createTransferSession } from "@earthworm/course-transfer";
import type { OfflineCourse } from "~/services/offlineCourse";
import { saveReceivedCourse } from "~/services/offlineCourse";

definePageMeta({ layout: "offline" });

const route = useRoute();
const status = ref<TransferStatus>("idle");
const message = ref("正在准备连接…");
let session: TransferSession | undefined;
let savedCourse: OfflineCourse | undefined;

function updateStatus(event: { status: TransferStatus; message?: string }): void {
  status.value = event.status;
  message.value =
    event.message ||
    {
      idle: "正在准备连接…",
      signaling: "正在连接信令服务…",
      "peer-ready": "电脑已加入，正在建立连接…",
      negotiating: "正在建立点对点连接…",
      connected: "连接成功，正在接收课程…",
      transferring: "正在接收并校验课程…",
      completed: "课程已保存，准备进入练习…",
      closed: "连接已关闭",
      error: "连接失败",
    }[event.status];
  // The transfer module emits `completed` only after it has sent the verified
  // receipt. Navigate on the next task so the receiver cannot close the data
  // channel before the sender observes that receipt.
  if (event.status === "completed" && savedCourse) {
    const course = savedCourse;
    setTimeout(() => {
      void navigateTo(`/game/${course.coursePackId}/${course.id}?offline=1`);
    }, 0);
  }
}

async function connect() {
  session?.close();
  status.value = "idle";
  savedCourse = undefined;
  const signal = String(route.query.signal || "");
  const room = String(route.query.room || "");
  if (!signal || !/^[a-f0-9]{32}$/.test(room)) {
    updateStatus({ status: "error", message: "二维码链接不完整，请让电脑重新创建房间" });
    return;
  }
  try {
    session = createTransferSession({
      role: "receiver",
      signalUrl: signal,
      roomToken: room,
      onStatus: updateStatus,
      onCourseReceived: async (received) => {
        savedCourse = await saveReceivedCourse(received);
      },
    });
    await session.connect();
  } catch (error) {
    updateStatus({ status: "error", message: error instanceof Error ? error.message : "连接失败" });
  }
}

onMounted(connect);
onUnmounted(() => session?.close());
</script>
