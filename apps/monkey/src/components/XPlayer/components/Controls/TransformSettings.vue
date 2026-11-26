<template>
  <div class="card card-sm w-56">
    <div class="card-body gap-2 p-3">
      <h3 class="text-sm font-semibold text-white/92">
        旋转与翻转
      </h3>
      <div class="space-y-2.5">
        <!-- 旋转控制 -->
        <fieldset class="fieldset p-0">
          <legend class="fieldset-legend w-full py-1 text-xs font-medium text-white/75">
            旋转 <span class="badge badge-xs border-0 bg-white/12 text-white/85">{{ transform.rotate.value }}°</span>
          </legend>
          <div class="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              class="flex-1 bg-white/8 text-white/85 hover:bg-white/16 hover:text-white"
              :disabled="transform.rotate.value === -270"
              @click="transform.left"
            >
              <Icon :name="I.ROTATE_LEFT" class="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="flex-1 bg-white/8 text-white/85 hover:bg-white/16 hover:text-white"
              @click="transform.normal"
            >
              <Icon :name="I.ROTATE_NORMAL" class="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="flex-1 bg-white/8 text-white/85 hover:bg-white/16 hover:text-white"
              :disabled="transform.rotate.value === 270"
              @click="transform.right"
            >
              <Icon :name="I.ROTATE_RIGHT" class="size-4" />
            </Button>
          </div>
        </fieldset>

        <!-- 翻转控制 -->
        <fieldset class="fieldset p-0">
          <legend class="fieldset-legend py-1 text-xs font-medium text-white/75">
            翻转
          </legend>
          <div class="flex gap-1.5">
            <Button
              size="sm"
              :variant="transform.flipX.value ? 'solid' : 'ghost'"
              :color="transform.flipX.value ? 'primary' : 'default'"
              :active="transform.flipX.value"
              class="flex-1"
              :class="!transform.flipX.value && 'bg-white/8 text-white/85 hover:bg-white/16 hover:text-white'"
              @click="transform.toggleFlipX"
            >
              <Icon :name="I.FLIP_X" class="size-4" />
              水平
            </Button>
            <Button
              size="sm"
              :variant="transform.flipY.value ? 'solid' : 'ghost'"
              :color="transform.flipY.value ? 'primary' : 'default'"
              :active="transform.flipY.value"
              class="flex-1"
              :class="!transform.flipY.value && 'bg-white/8 text-white/85 hover:bg-white/16 hover:text-white'"
              @click="transform.toggleFlipY"
            >
              <Icon :name="I.FLIP_Y" class="size-4" />
              垂直
            </Button>
          </div>
        </fieldset>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@115master/ui'
import { usePlayerContext } from '@/components/XPlayer/hooks/usePlayerProvide'
import { I, Icon } from '@/icons'

const { transform } = usePlayerContext()
</script>
