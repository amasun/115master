declare module 'opencc-js/t2cn' {
  type Locale = 'cn' | 'hk' | 'jp' | 't' | 'tw' | 'twp'

  export function Converter(options: {
    from: Exclude<Locale, 'cn'>
    to: 'cn'
  }): (text: string) => string
}
