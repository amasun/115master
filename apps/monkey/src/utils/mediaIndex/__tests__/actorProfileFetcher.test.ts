// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseJavBusActorProfile } from '../actorProfileFetcher'

describe('parseJavBusActorProfile', () => {
  it('解析完整的 JavBus 演员个人资料页 HTML', () => {
    const html = `
      <div class="avatar-box">
        <div class="photo-frame">
          <img src="/pics/actress/abc_a.jpg" title="三上悠亜">
        </div>
        <div class="photo-info">
          <span class="pb10">三上悠亜</span>
          <p>生日: 1993-08-16</p>
          <p>年齡: 31</p>
          <p>身高: 159cm</p>
          <p>罩杯: F</p>
          <p>胸圍: 83cm</p>
          <p>腰圍: 57cm</p>
          <p>臀圍: 88cm</p>
          <p>出生地: 愛知県</p>
          <p>愛好: ダンス、ショッピング</p>
          <p>別名: 鬼頭桃菜、三上悠亜</p>
        </div>
      </div>
    `

    const profile = parseJavBusActorProfile(
      html,
      '三上悠亜',
      '三上悠亜',
      'https://www.javbus.com/star/abc',
      1700000000000,
    )

    expect(profile).toEqual({
      actorKey: '三上悠亜',
      name: '三上悠亜',
      avatarUrl: 'https://www.javbus.com/pics/actress/abc_a.jpg',
      birthday: '1993-08-16',
      age: '31',
      height: '159cm',
      cup: 'F',
      bust: '83cm',
      waist: '57cm',
      hips: '88cm',
      birthplace: '愛知県',
      hobby: 'ダンス、ショッピング',
      aliases: ['鬼頭桃菜'],
      profileUrl: 'https://www.javbus.com/star/abc',
      source: 'javbus',
      updatedAt: 1700000000000,
    })
  })

  it('忽略 nowprinting 占位头像并在简体标签下正确解析', () => {
    const html = `
      <div class="avatar-box">
        <div class="photo-frame">
          <img src="/pics/actress/nowprinting.gif">
        </div>
        <div class="photo-info">
          <span class="pb10">测试演员</span>
          <p>年龄：25</p>
          <p>胸围：85cm</p>
          <p>腰围：58cm</p>
          <p>臀围：86cm</p>
          <p>爱好：旅行</p>
        </div>
      </div>
    `

    const profile = parseJavBusActorProfile(html, '测试演员', '测试演员', undefined, 1700000000001)
    expect(profile).toEqual({
      actorKey: '测试演员',
      name: '测试演员',
      age: '25',
      bust: '85cm',
      waist: '58cm',
      hips: '86cm',
      hobby: '旅行',
      aliases: [],
      source: 'javbus',
      updatedAt: 1700000000001,
    })
  })

  it('在缺少 .avatar-box 或无任何有效资料字段时返回 null', () => {
    expect(parseJavBusActorProfile('', 'a', 'A')).toBeNull()
    expect(parseJavBusActorProfile('<div>empty</div>', 'a', 'A')).toBeNull()
    expect(parseJavBusActorProfile(`
      <div class="avatar-box">
        <div class="photo-frame"><img src="/pics/actress/nowprinting.gif"></div>
        <div class="photo-info"><span class="pb10">无资料</span></div>
      </div>
    `, 'a', 'A')).toBeNull()
  })

  it('剥离 JavBus .pb10 内嵌套的「有碼」按钮与角标文本', () => {
    const html = `
      <div class="avatar-box">
        <div class="photo-frame"><img src="/pics/actress/abc_a.jpg"></div>
        <div class="photo-info">
          <span class="pb10">三上悠亜 <button class="btn btn-xs btn-primary">有碼</button></span>
          <p>身高: 159cm</p>
        </div>
      </div>
    `
    const profile = parseJavBusActorProfile(html, '三上悠亚', '三上悠亚有码', undefined, 1700000000002)
    expect(profile?.name).toBe('三上悠亜')
  })
})
