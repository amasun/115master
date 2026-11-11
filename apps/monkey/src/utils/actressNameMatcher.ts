import { Converter } from 'opencc-js/t2cn'

/** 日文新字体 / 繁体 → 简体 */
const toSimplified = Converter({ from: 'jp', to: 'cn' })

/** 参与模糊匹配的名字最短长度 */
const MIN_FUZZY_LENGTH = 2
/** 参与模糊匹配的名字最长长度 */
const MAX_FUZZY_LENGTH = 24
/** 不含汉字的名字（假名、英文）参与模糊匹配的最短长度 */
const MIN_NON_HAN_LENGTH = 4
/** 含汉字的名字达到该长度后，不再要求前后有分隔 */
const FREE_HAN_LENGTH = 3

/** 同一演员的多张头像后缀，如 `大橋未久-2` */
const VARIANT_SUFFIX = /-\d+$/
const HAN = /\p{Script=Han}/u
const WORD_CHAR = /[\p{L}\p{N}]/u

/**
 * 归一化名字
 * @description 全半角统一、繁体与日文汉字转简体、忽略大小写
 */
export function normalizeActressName(name: string): string {
  return toSimplified(name.normalize('NFKC')).toLowerCase().trim()
}

/**
 * 演员名字匹配器
 * @description 先精确匹配，再从标题中找出包含的最长演员名
 */
export class ActressNameMatcher {
  /** 归一化名字 -> 原始名字 */
  private index = new Map<string, string>()
  /** 标题 -> 匹配结果 */
  private resultCache = new Map<string, string | undefined>()
  /** 名字 -> 匹配结果 */
  private nameCache = new Map<string, string | undefined>()
  /** 前缀 -> 候选列表 */
  private candidateCache = new Map<string, string[]>()
  private maxLength = 0

  constructor(names: Iterable<string>) {
    const variants: string[] = []
    for (const name of names) {
      if (VARIANT_SUFFIX.test(name)) {
        variants.push(name)
        continue
      }
      this.add(name, name)
    }
    // 仅有带后缀头像的演员，用去掉后缀的名字兜底
    for (const name of variants) {
      this.add(name.replace(VARIANT_SUFFIX, ''), name)
    }
  }

  /**
   * 从标题中匹配演员
   * @returns 头像库中的原始名字
   */
  match(title: string): string | undefined {
    if (this.resultCache.has(title)) {
      return this.resultCache.get(title)
    }
    const result = this.find(normalizeActressName(title))
    this.resultCache.set(title, result)
    return result
  }

  /**
   * 按完整名字匹配演员，支持忽略写法差异以及渐进式缩位降级（1234 -> 123 -> 12）
   * @returns 头像库中的原始名字
   */
  matchName(name: string): string | undefined {
    if (this.nameCache.has(name)) {
      return this.nameCache.get(name)
    }
    const result = this.resolveName(name)
    this.nameCache.set(name, result)
    return result
  }

  /**
   * 搜索以指定前缀开头的演员名候选列表
   * @param prefix 搜索前缀
   * @returns 匹配到的原始名字列表（完全匹配优先，其余按收录顺序）
   */
  searchCandidates(prefix: string): string[] {
    const key = normalizeActressName(prefix)
    if (!key || key.length < MIN_FUZZY_LENGTH) {
      return []
    }
    if (this.candidateCache.has(key)) {
      return this.candidateCache.get(key)!
    }
    const results: string[] = []
    const exact = this.index.get(key)
    if (exact) {
      results.push(exact)
    }
    for (const [k, original] of this.index) {
      if (k !== key && k.startsWith(key)) {
        results.push(original)
      }
    }
    this.candidateCache.set(key, results)
    return results
  }

  private resolveName(name: string): string | undefined {
    const key = normalizeActressName(name)
    if (!key) {
      return undefined
    }

    /** 1. 完整名字精确搜索（忽略繁简、大小写等写法差异） */
    const exact = this.index.get(key)
    if (exact) {
      return exact
    }

    // 演员名过长（如标题等长文本）或过短不做缩位降级，避免误匹配
    if (key.length > 5 || key.length < MIN_FUZZY_LENGTH) {
      return undefined
    }

    // 2 & 3. 渐进式缩位降级：去掉末位搜索（如 123），继续去位搜索（如 12）
    // 最多去位至 MIN_FUZZY_LENGTH (2)，取第一候选
    for (let len = key.length - 1; len >= MIN_FUZZY_LENGTH; len--) {
      const prefix = key.slice(0, len)
      const candidates = this.searchCandidates(prefix)
      if (candidates.length > 0) {
        return candidates[0]
      }
    }

    return undefined
  }

  private add(name: string, original: string) {
    const key = normalizeActressName(name)
    if (!key || this.index.has(key)) {
      return
    }
    this.index.set(key, original)
    if (key.length <= MAX_FUZZY_LENGTH) {
      this.maxLength = Math.max(this.maxLength, key.length)
    }
  }

  private find(title: string): string | undefined {
    const exact = this.index.get(title)
    if (exact) {
      return exact
    }

    /** 长名字优先，避免「明里」抢先于「明里つむぎ」 */
    const longest = Math.min(this.maxLength, title.length - 1)
    for (let length = longest; length >= MIN_FUZZY_LENGTH; length--) {
      for (let start = 0; start + length <= title.length; start++) {
        const part = title.slice(start, start + length)
        const original = this.index.get(part)
        if (original && this.isAcceptable(title, start, part)) {
          return original
        }
      }
    }
    return undefined
  }

  /**
   * 过滤容易误判的短名字
   * @description 短名字和不含汉字的名字必须独立成词，如「合集 明里」「Julia 合集」
   */
  private isAcceptable(title: string, start: number, part: string): boolean {
    const hasHan = HAN.test(part)
    if (!hasHan && part.length < MIN_NON_HAN_LENGTH) {
      return false
    }
    if (hasHan && part.length >= FREE_HAN_LENGTH) {
      return true
    }
    const before = title[start - 1]
    const after = title[start + part.length]
    return !(before && WORD_CHAR.test(before)) && !(after && WORD_CHAR.test(after))
  }
}
