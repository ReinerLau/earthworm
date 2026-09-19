<template>
  <div
    class="h-full w-full bg-white text-slate-600 transition-colors dark:bg-theme-dark dark:text-slate-300"
  >
    <div class="m-auto flex h-fit min-h-screen w-full min-w-0 flex-col items-center">
      <Navbar />
      <div class="flex w-full min-w-0 flex-1 px-6">
        <slot></slot>
      </div>
      <Footer></Footer>
    </div>
  </div>
</template>

<script setup lang="ts"></script>
