import type { FacetCount } from '@/utils/mediaIndex'

export type GenreGroupKey = 'theme' | 'role' | 'outfit' | 'body' | 'action' | 'play' | 'other'

export interface GenreGroup {
  key: GenreGroupKey
  label: string
  items: FacetCount[]
}

const GROUP_LABELS: Record<GenreGroupKey, string> = {
  theme: '主题',
  role: '角色',
  outfit: '服装',
  body: '体型',
  action: '行为',
  play: '玩法',
  other: '其他',
}

const GROUP_ORDER: GenreGroupKey[] = ['theme', 'role', 'outfit', 'body', 'action', 'play', 'other']

const GROUP_MATCHERS: Array<{ key: Exclude<GenreGroupKey, 'other'>, pattern: RegExp }> = [
  {
    key: 'outfit',
    pattern: /制服|絲襪|丝袜|黑絲|黑丝|白絲|白丝|網襪|网袜|連褲襪|连裤袜|吊帶襪|吊带袜|水手服|泳裝|泳装|泳衣|比基尼|競泳|竞泳|死庫水|死库水|內衣|内衣|情趣內衣|女僕|女仆|旗袍|和服|浴衣|眼鏡|眼镜|兔女郎|緊身衣|紧身衣|運動服|运动服|體操服|体操服|高跟鞋|圍裙|围裙|護士服|护士服|OL裝|OL装|短裙|迷你裙|學生服|学生服|靴/i,
  },
  {
    key: 'body',
    pattern: /巨乳|爆乳|美乳|貧乳|贫乳|微乳|超乳|美腿|長腿|长腿|美臀|巨臀|翹臀|翘臀|嬌小|娇小|蘿莉|萝莉|高挑|長身|长身|豐滿|丰满|肉感|苗條|苗条|纖細|纤细|白虎|無毛|无毛|黑皮|小麥色|小麦色|白皙|美肌|紋身|纹身|刺青|孕婦|孕妇|筋肉|大胸|平胸|長發|长发|短髮|短发/,
  },
  {
    key: 'action',
    pattern: /中出|內射|内射|顏射|颜射|口交|口爆|深喉|乳交|夾射|夹射|潮吹|噴水|喷水|自慰|足交|腳交|脚交|騎乘|骑乘|後入|后入|接吻|舌吻|舔陰|舔阴|69|顏面騎乘|颜面骑乘|手淫|指交|高潮|絕頂|绝顶|吞精|飲精|饮精|輪姦|轮奸|強姦|强奸|肛交|後庭|后庭|素股|失禁|放尿|乳首|舔乳/,
  },
  {
    key: 'play',
    pattern: /3P|4P|多P|群交|亂交|乱交|捆綁|捆绑|拘束|緊縛|紧缚|SM|調教|调教|蒙眼|玩具|跳蛋|按摩棒|電動|电动|自慰器|露出|野外|車震|车震|電車|电车|後宮|后宫|角色扮演|Cosplay|コスプレ|ASMR|第一人稱|第一人称|主觀視角|主观视角|VR|催眠|時間停止|时间停止|透明人|偷窺|偷窥|偷拍|搭訕|搭讪|企劃|企划|NTR|寢取|寝取|出軌|出轨|不倫|不伦|凌辱|侵犯|監禁|监禁|鬼畜|按摩|精油|溫泉|温泉|感謝祭|感谢祭|素人/i,
  },
  {
    key: 'role',
    pattern: /美少女|熟女|人妻|已婚|寡婦|寡妇|OL|女教師|女教师|教師|教师|老師|老师|護士|护士|空姐|空服員|空服员|女大學生|女大学生|學生|学生|女高中生|JK|義母|义母|繼母|继母|母親|母亲|媽媽|妈妈|妹妹|姐姐|姊姊|青梅竹馬|青梅竹马|偶像|模特|辣妹|ギャル|痴女|癡女|美魔女|女上司|女社長|女社长|秘書|秘书|主播|家政婦|家政妇|按摩師|按摩师|女搜查官|搜查官|巫女|修女|魔法少女|人妖|跨性別|女主播|網紅|网红|少婦|少妇/i,
  },
  {
    key: 'theme',
    pattern: /單體作品|单体作品|單人作品|单人作品|劇情|剧情|精選|精选|合集|總集編|总集编|中文字幕|4K|高清|HD|藍光|蓝光|數位馬賽克|数位马赛克|薄碼|薄码|無碼|无码|流出|紀錄片|纪录片|出道|新人|引退|紀念|纪念|系列|純愛|纯爱|戀愛|恋爱|初戀|初恋|青春|校園|校园|職場|职场|家庭|近親|近亲|同窗|復仇|复仇|懸疑|悬疑|動作|动作|科幻|喜劇|喜剧|恐怖|愛情|爱情|動畫|动画|犯罪|戰爭|战争|奇幻|冒險|冒险/i,
  },
]

export function classifyGenreGroup(name: string): GenreGroupKey {
  const trimmed = name.trim()
  if (!trimmed)
    return 'other'
  for (const matcher of GROUP_MATCHERS) {
    if (matcher.pattern.test(trimmed))
      return matcher.key
  }
  return 'other'
}

export function groupGenres(genres: readonly FacetCount[]): GenreGroup[] {
  const buckets = new Map<GenreGroupKey, FacetCount[]>()
  for (const key of GROUP_ORDER)
    buckets.set(key, [])

  for (const item of genres) {
    const key = classifyGenreGroup(item.name)
    buckets.get(key)!.push(item)
  }

  return GROUP_ORDER
    .map(key => ({
      key,
      label: GROUP_LABELS[key],
      items: buckets.get(key)!,
    }))
    .filter(group => group.items.length > 0)
}
