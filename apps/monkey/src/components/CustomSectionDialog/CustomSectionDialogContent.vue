<template>
  <div class="flex flex-col gap-3">
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="flex flex-col gap-1 text-xs">
        <span class="text-base-content/80 font-medium">栏目名称</span>
        <input
          :value="name"
          type="text"
          maxlength="24"
          placeholder="例如：纪录片、自拍合集、无码精选"
          class="input input-sm input-bordered bg-base-100/80 rounded-xl text-xs"
          @input="$emit('update:name', ($event.target as HTMLInputElement).value)"
        >
      </label>

      <label class="flex flex-col gap-1 text-xs">
        <span class="text-base-content/80 font-medium">专属刮削模式</span>
        <select
          :value="scrapeMode"
          aria-label="专属刮削模式"
          class="select select-sm select-bordered bg-base-100/80 rounded-xl text-xs"
          @change="$emit('update:scrapeMode', ($event.target as HTMLSelectElement).value as CustomScrapeMode)"
        >
          <option value="jav">
            番号刮削（JavBus / AVBASE 等）
          </option>
          <option value="cinema">
            院线刮削（TMDB / 豆瓣）
          </option>
          <option value="folder_collection">
            目录合集（按文件夹聚合，不刮削）
          </option>
          <option value="none">
            纯本地平铺（不刮削）
          </option>
        </select>
      </label>
    </div>

    <IndexFolderPickerContent
      :model-value="folders"
      :fixed-category="scrapeMode === 'cinema' ? 'cinema' : 'jav'"
      description="至少选择一个 115 目录绑定到该自建栏目，目录内视频将独立展示在此栏目中。"
      @update:model-value="$emit('update:folders', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { CustomScrapeMode, IndexRootFolder } from '@/utils/userSettings'
import IndexFolderPickerContent from '@/components/IndexFolderPicker/IndexFolderPickerContent.vue'

defineProps<{
  name: string
  scrapeMode: CustomScrapeMode
  folders: IndexRootFolder[]
}>()

defineEmits<{
  'update:name': [value: string]
  'update:scrapeMode': [value: CustomScrapeMode]
  'update:folders': [value: IndexRootFolder[]]
}>()
</script>
