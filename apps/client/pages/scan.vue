<template>
  <section class="py-10">
    <div class="mb-8 flex items-center justify-between">
      <div>
        <p class="text-sm opacity-60">Earthworm 本地课程</p>
        <h1 class="text-2xl font-bold">扫描电脑二维码</h1>
      </div>
      <NuxtLink
        class="btn btn-ghost btn-sm"
        to="/course-pack"
        >返回</NuxtLink
      >
    </div>

    <div class="mx-auto max-w-md text-center">
      <p class="text-sm opacity-70">允许相机权限后，将电脑上的二维码放入取景框。</p>
      <div class="relative mt-6 aspect-square overflow-hidden rounded-2xl bg-black">
        <video
          ref="video"
          class="h-full w-full object-cover"
          autoplay
          muted
          playsinline
        ></video>
        <div
          class="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-white"
        ></div>
      </div>
      <p
        class="mt-4 text-sm"
        :class="hasError ? 'text-error' : 'opacity-70'"
      >
        {{ message }}
      </p>
      <p
        v-if="hasError"
        class="mt-2 text-xs opacity-60"
      >
        如果之前拒绝过权限，请在 iPhone 设置 → Safari → 相机中允许访问。
      </p>
      <button
        class="btn mt-6"
        type="button"
        @click="cancel"
      >
        取消
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { BrowserQRCodeReader } from "@zxing/browser";
import { definePageMeta, navigateTo } from "#imports";
import { nextTick, onMounted, onUnmounted, ref } from "vue";

import { parseTransferQr } from "~/utils/transferQr";

definePageMeta({ layout: "offline" });

const video = ref<HTMLVideoElement>();
const message = ref("正在启动相机…");
const hasError = ref(false);
const reader = new BrowserQRCodeReader();
let controls: { stop: () => void } | undefined;
let completed = false;

onMounted(async () => {
  await nextTick();
  try {
    controls = await reader.decodeFromVideoDevice(undefined, video.value!, (result) => {
      if (!result || completed) return;
      const payload = parseTransferQr(result.getText(), window.location.origin);
      if (!payload) {
        hasError.value = true;
        message.value = "这不是有效的 Earthworm 传输二维码";
        return;
      }

      completed = true;
      controls?.stop();
      void navigateTo({ path: "/receive", query: payload });
    });
    message.value = "请扫描电脑上的课程二维码";
  } catch (error) {
    hasError.value = true;
    message.value = error instanceof Error ? error.message : "无法打开相机";
  }
});

function cancel() {
  controls?.stop();
  void navigateTo("/course-pack");
}

onUnmounted(() => controls?.stop());
</script>
