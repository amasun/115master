import { resize } from './resize.ts'

export interface CompressOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  type?: string
}

/**
 * 使用 Canvas 将图片 Blob 压缩为指定尺寸和格式
 */
export function compress(blob: Blob, options: CompressOptions = {}): Promise<Blob> {
  const {
    maxWidth = 200,
    maxHeight = 200,
    quality = 0.8,
    type = 'image/jpeg',
  } = options

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const canvas = document.createElement('canvas')
      const { width, height } = resize(img.width, img.height, maxWidth, maxHeight)

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        canvas.width = 0
        canvas.height = 0
        reject(new Error('无法获取 Canvas 上下文'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (result) => {
          canvas.width = 0
          canvas.height = 0
          if (result)
            resolve(result)
          else
            reject(new Error('图片压缩失败'))
        },
        type,
        quality,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('图片加载失败'))
    }

    img.src = objectUrl
  })
}
