import type { MarkerDoc } from '../types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkerStore, markerStore } from '../../cache/markerStore'

const { mockStorage, storeMap } = vi.hoisted(() => {
  const storeMap = new Map<string, unknown>()
  const mockStorage = {
    getItem: vi.fn(async (key: string) => storeMap.get(key) ?? null),
    setItem: vi.fn(async (key: string, val: unknown) => {
      storeMap.set(key, val)
      return val
    }),
    removeItem: vi.fn(async (key: string) => {
      storeMap.delete(key)
    }),
    clear: vi.fn(async () => {
      storeMap.clear()
    }),
    iterate: vi.fn(async (cb: (value: unknown, key: string, iterationNumber: number) => void) => {
      let i = 1
      for (const [key, val] of storeMap.entries())
        cb(val, key, i++)
    }),
  }
  return { mockStorage, storeMap }
})

vi.mock('localforage', () => ({
  default: {
    createInstance: vi.fn(() => mockStorage),
    INDEXEDDB: 'IndexedDB',
  },
}))

describe('markerStore', () => {
  beforeEach(() => {
    storeMap.clear()
    vi.clearAllMocks()
  })

  it('单例实例正常初始化', () => {
    expect(markerStore).toBeInstanceOf(MarkerStore)
  })

  it('saveDoc 与 getDoc 正常写入与读取', async () => {
    const doc: MarkerDoc = {
      v: 1,
      pickCode: 'pick1',
      markers: [{ id: 'm1', time: 10, label: 'test', createdAt: 100, updatedAt: 100 }],
      updatedAt: 100,
    }

    await markerStore.saveDoc(doc)
    const retrieved = await markerStore.getDoc('pick1')
    expect(retrieved).toEqual(doc)
  })

  it('saveDoc 写入失败时抛出错误', async () => {
    const doc: MarkerDoc = {
      v: 1,
      pickCode: 'pick1',
      markers: [],
      updatedAt: 100,
    }

    mockStorage.setItem.mockRejectedValueOnce(new Error('磁盘已满'))
    await expect(markerStore.saveDoc(doc)).rejects.toThrow('磁盘已满')
  })

  it('getDoc 读取不存在的 pickCode 返回 null', async () => {
    const retrieved = await markerStore.getDoc('not-exist')
    expect(retrieved).toBeNull()
  })

  it('getDoc 传入空字符串直接返回 null', async () => {
    const retrieved = await markerStore.getDoc('')
    expect(retrieved).toBeNull()
  })

  it('getAllDocs 获取所有存储的打点文档', async () => {
    const doc1: MarkerDoc = { v: 1, pickCode: 'p1', markers: [], updatedAt: 100 }
    const doc2: MarkerDoc = { v: 1, pickCode: 'p2', markers: [], updatedAt: 200 }

    await markerStore.saveDoc(doc1)
    await markerStore.saveDoc(doc2)

    const all = await markerStore.getAllDocs()
    expect(all).toEqual({
      p1: doc1,
      p2: doc2,
    })
  })

  it('replaceAll 清空并批量替换文档', async () => {
    const oldDoc: MarkerDoc = { v: 1, pickCode: 'old', markers: [], updatedAt: 10 }
    await markerStore.saveDoc(oldDoc)

    const newDocs: Record<string, MarkerDoc> = {
      p1: { v: 1, pickCode: 'p1', markers: [], updatedAt: 100 },
      p2: { v: 1, pickCode: 'p2', markers: [], updatedAt: 200 },
    }

    await markerStore.replaceAll(newDocs)

    const all = await markerStore.getAllDocs()
    expect(all.old).toBeUndefined()
    expect(all.p1).toEqual(newDocs.p1)
    expect(all.p2).toEqual(newDocs.p2)
  })

  it('replaceAll 支持数组参数', async () => {
    const newDocs: MarkerDoc[] = [
      { v: 1, pickCode: 'a', markers: [], updatedAt: 100 },
      { v: 1, pickCode: 'b', markers: [], updatedAt: 200 },
    ]

    await markerStore.replaceAll(newDocs)
    const all = await markerStore.getAllDocs()
    expect(Object.keys(all)).toEqual(['a', 'b'])
  })

  it('replaceAll 写入失败时抛出错误且旧数据仍在', async () => {
    const oldDoc: MarkerDoc = { v: 1, pickCode: 'old-1', markers: [], updatedAt: 10 }
    await markerStore.saveDoc(oldDoc)

    mockStorage.setItem.mockRejectedValueOnce(new Error('写入失败测试'))

    const newDocs = {
      new1: { v: 1 as const, pickCode: 'new1', markers: [], updatedAt: 20 },
    }

    await expect(markerStore.replaceAll(newDocs)).rejects.toThrow('写入失败测试')

    const retained = await markerStore.getDoc('old-1')
    expect(retained).toEqual(oldDoc)
  })
})
