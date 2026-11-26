<template>
  <div class="x-player-header-group">
    <ul :class="styles.root">
      <li
        v-for="(action, index) in actions"
        :key="index"
        :class="styles.item"
        @click="() => action.onAction(ctx)"
      >
        <Button variant="ghost" shape="circle" :class="styles.button">
          <Icon :name="action.icon" :class="[styles.icon, action.iconColor]" />
        </Button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { FileActionMenuProps } from './FileActionMenu.types'
import { Button } from '@115master/ui'
import { controlStyles } from '@/components/XPlayer/styles/common'
import { Icon } from '@/icons'
import { clsx } from '@/utils/clsx'

const props = defineProps<FileActionMenuProps>()

const { ctx } = props

const styles = clsx({
  root: 'flex items-center gap-0.5',
  item: 'flex items-center',
  button: controlStyles.btn.root,
  icon: controlStyles.btn.icon,
})
</script>

<style module>
</style>
