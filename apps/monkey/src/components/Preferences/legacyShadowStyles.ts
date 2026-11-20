/** 旧版 115 页面中弹窗挂在文件列表 iframe 内，遮罩只能盖住局部区域，显得突兀；改为透明遮罩，仅保留弹窗毛玻璃 */
export const TRANSPARENT_BACKDROP_STYLES = '.ui-dialog::backdrop { background: transparent; }'

/**
 * 旧版 115 页面专用：把样式中 :root 上的设计变量复制到 :host。
 * Shadow DOM 内匹配不到 :root，毛玻璃模糊等变量为空，弹窗只剩半透明底色。
 */
export function createHostTokenStyles(doc: Document, cssText: string): string {
  const StyleSheet = doc.defaultView?.CSSStyleSheet
  if (!StyleSheet)
    return ''
  const sheet = new StyleSheet()
  sheet.replaceSync(cssText)
  const declarations: string[] = []
  const collect = (rules: CSSRuleList) => {
    /* 样式表可能来自 iframe 的 realm，不用 instanceof，按属性判断规则类型 */
    for (const rule of Array.from(rules)) {
      if ('selectorText' in rule) {
        const styleRule = rule as CSSStyleRule
        if (styleRule.selectorText === ':root')
          declarations.push(styleRule.style.cssText)
      }
      else if ('cssRules' in rule) {
        collect((rule as CSSGroupingRule).cssRules)
      }
    }
  }
  collect(sheet.cssRules)
  return declarations.length ? `:host { ${declarations.join(' ')} }` : ''
}
