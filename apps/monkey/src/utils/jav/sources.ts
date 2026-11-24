import type { JavInfoSource } from './loadInfo'
import { AvBase } from './avBase'
import { Fanza } from './fanza'
import { Fc2Official } from './fc2Official'
import { Fd2Ppv, isFd2PpvAvNumber } from './fd2Ppv'
import { Jav321 } from './jav321'
import { JavBus } from './javBus'
import { JavDB } from './javDB'
import { JavLibrary } from './javLibrary'
import { isMgStageAvNumber, MGStage } from './mgStage'
import { MissAV } from './missAV'

export interface CreateJavInfoSourcesOptions {
  enableFanza?: boolean
}

/** 为当前标识创建范围最窄的资料源列表。 */
export function createJavInfoSources(
  avNumber: string,
  options?: CreateJavInfoSourcesOptions,
): JavInfoSource[] {
  const baseSources: JavInfoSource[] = [
    new JavLibrary(),
    new JavBus(),
    new JavDB(),
    new MissAV(),
    new Jav321(),
    new AvBase(),
  ]

  if (isFd2PpvAvNumber(avNumber))
    return [new Fd2Ppv(), new Fc2Official(), ...baseSources]

  const sources: JavInfoSource[] = [...baseSources]
  if (isMgStageAvNumber(avNumber))
    sources.unshift(new MGStage())
  if (options?.enableFanza)
    sources.unshift(new Fanza())
  return sources
}
