import './player.css'

export const controlStyles = {
  btn: {
    root: 'x-player-btn',
    icon: 'size-5',
  },
  btnText: {
    root: [
      'x-player-btn x-player-btn-text',
      'text-[13px] font-semibold tracking-wide',
      'no-underline hover:no-underline!',
    ],
  },
  menu: {
    root: 'menu p-1.5 min-w-28 gap-0.5 text-[13px]',
    a: [
      'flex items-center justify-between',
      'rounded-lg px-3 py-1.5 font-medium text-white/85',
      'transition-colors duration-150',
      'hover:bg-white/10 hover:text-white',
    ],
    active: 'bg-primary/20! text-primary! font-semibold hover:bg-primary/25!',
    icon: 'size-4.5',
    label: 'text-white/92',
    desc: 'text-white/50 text-xs',
  },
  text: 'text-sm text-white/92 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]',
  subtext: 'text-white/60',
}
