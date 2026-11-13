import { describe, expect, it } from 'vitest'
import { pickTimes } from '../pickTimes'

const times = [10, 20, 30, 40, 50, 60, 70, 80]

describe('pickTimes', () => {
  it('缺省或不少于总数时返回全部', () => {
    expect(pickTimes(times)).toEqual(times)
    expect(pickTimes(times, 8)).toEqual(times)
    expect(pickTimes(times, 12)).toEqual(times)
  })

  it('只从原有时间点中挑选，保留首尾且数量正确', () => {
    ;[4, 5, 6].forEach((num) => {
      const picked = pickTimes(times, num)
      expect(picked).toHaveLength(num)
      expect(picked[0]).toBe(10)
      expect(picked[num - 1]).toBe(80)
      expect(picked.every(time => times.includes(time))).toBe(true)
    })
  })
})
