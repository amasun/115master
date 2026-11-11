import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActressFaceDB } from '../actressFaceDB'

vi.mock('$', () => ({
  GM_notification: vi.fn(),
}))

vi.mock('@/utils/cache/actressFaceCache', () => ({
  actressFaceCache: {
    getLastUpdateTime: vi.fn().mockResolvedValue(Date.now()),
    getActressData: vi.fn().mockResolvedValue({
      timestamp: Date.now(),
      imageMap: [
        ['大橋未久', [{ folder: 'D', filename: '大橋未久.jpg', timestamp: 12345 }]],
        ['美谷朱音', [{ folder: 'M', filename: '美谷朱音.jpg', timestamp: 12345 }]],
        ['美谷朱里', [{ folder: 'M', filename: '美谷朱里.jpg', timestamp: 12345 }]],
      ],
    }),
    saveActressData: vi.fn(),
  },
}))

describe('actressFaceDB findActress 降级匹配', () => {
  let db: ActressFaceDB

  beforeEach(async () => {
    db = new ActressFaceDB()
    await db.init()
  })

  it('完整命中：精确匹配或写法差异', async () => {
    const res = await db.findActress('大桥未久', 'name')
    expect(res).toBeDefined()
    expect(res?.filename).toBe('大橋未久.jpg')
    expect(res?.folder).toBe('D')
  })

  it('一级降级：末位不一致时缩位命中', async () => {
    const res = await db.findActress('美谷朱X', 'name')
    expect(res).toBeDefined()
    expect(res?.filename).toBe('美谷朱音.jpg')
  })

  it('二级降级：去两位后命中第一候选', async () => {
    const res = await db.findActress('美谷XX', 'name')
    expect(res).toBeDefined()
    expect(res?.filename).toBe('美谷朱音.jpg')
  })

  it('全部失败：无候选时返回 undefined', async () => {
    const res = await db.findActress('张三李四', 'name')
    expect(res).toBeUndefined()
  })

  it('title 模式下也支持目录名缩位降级', async () => {
    const res = await db.findActress('美谷朱X', 'title')
    expect(res).toBeDefined()
    expect(res?.filename).toBe('美谷朱音.jpg')
  })
})
