import { useEffect, useRef } from 'react'

export type Lot = { lot: number; stage: number; color?: number; selected?: boolean }

type Point = [number, number, number?]
const noPan: [number, number] = [0, 0]

export function lotPosition(index: number): [number, number] {
  const column = index % 3
  const row = Math.floor(index / 3)
  return [column * 5, row * 5]
}

function geometry(width: number, height: number, lots: Lot[], zoom: number, pan: [number, number]) {
  const positions = lots.map(lot => ({ ...lot, xy: lotPosition(lot.lot) }))
  const maxX = Math.max(0, ...positions.map(p => p.xy[0])) + 5.4
  const maxY = Math.max(0, ...positions.map(p => p.xy[1])) + 5.4
  const unit = Math.min(width / (maxX + maxY + 2), height / ((maxX + maxY) * .45 + 4.5)) * zoom
  const originX = width / 2 - (maxX - maxY) * unit / 2 + pan[0]
  const originY = height / 2 - (maxX + maxY) * unit * .225 + unit * .55 + pan[1]
  return { positions, maxX, maxY, unit, originX, originY }
}

export function lotAt(x: number, y: number, width: number, height: number, lots: Lot[], zoom: number, pan: [number, number]) {
  const { positions, unit, originX, originY } = geometry(width, height, lots, zoom, pan)
  const dx = (x - originX) / unit
  const dy = (y - originY) / (unit * .45)
  const gx = (dy + dx) / 2, gy = (dy - dx) / 2
  return positions.find(({ xy: [lx,ly] }) => gx >= lx && gx < lx + 5 && gy >= ly && gy < ly + 5)?.lot
}

export function TownArt({ lots, className = '', scale = 1, pan = noPan }: {
  lots: Lot[]; className?: string; scale?: number; pan?: [number, number]
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const latest = useRef(lots)
  latest.current = lots
  const lotKey = lots.map(lot => [lot.lot, lot.stage, lot.color, lot.selected].join('/')).join('|')
  useEffect(() => {
    const canvas = ref.current!
    const paint = () => {
      const bounds = canvas.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const dpr = window.devicePixelRatio
      canvas.width = Math.round(bounds.width * dpr)
      canvas.height = Math.round(bounds.height * dpr)
      const context = canvas.getContext('2d')
      if (!context) return
      context.scale(dpr, dpr)
      draw(context, bounds.width, bounds.height, latest.current, scale, pan)
    }
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    paint()
    return () => observer.disconnect()
  }, [lotKey, scale, pan])
  return <canvas className={'town-art ' + className} ref={ref} aria-hidden="true" />
}

function draw(ctx: CanvasRenderingContext2D, width: number, height: number, lots: Lot[], zoom: number, pan: [number, number]) {
  const { positions, maxX, maxY, unit, originX, originY } = geometry(width, height, lots, zoom, pan)
  const project = ([x, y, z = 0]: Point) => [originX + (x - y) * unit, originY + (x + y) * unit * .45 - z * unit] as const

  function polygon(points: Point[], color: string) {
    ctx.beginPath()
    for (const [i, p] of points.entries()) {
      const [x, y] = project(p)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }

  function flat(x: number, y: number, w: number, d: number, z: number, color: string) {
    polygon([[x,y,z], [x+w,y,z], [x+w,y+d,z], [x,y+d,z]], color)
  }

  function block(x: number, y: number, w: number, d: number, z: number, h: number, colors: [string, string, string]) {
    const top = z + h
    polygon([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,top],[x,y+d,top]], colors[1])
    polygon([[x+w,y,z],[x+w,y+d,z],[x+w,y+d,top],[x+w,y,top]], colors[2])
    flat(x,y,w,d,top,colors[0])
  }

  function tree(x: number, y: number, h: number, golden = false) {
    flat(x-.24,y-.18,.82,.58,.013,'#49563a')
    block(x-.06,y-.06,.12,.12,0,h*.46,['#8b684a','#634431','#533626'])
    const palette = golden ? ['#be9b58','#947444','#7d593a'] : ['#83965b','#637848','#4b653e']
    for (let level = 0; level < 3; level++) {
      const size = h * (.6 - level * .14)
      block(x-size/2,y-size/2,size,size,h*(.3+level*.19),h*.2,[palette[0],palette[1],palette[2]])
    }
  }

  function house(x: number, y: number, w: number, d: number, h: number, color: number) {
    const roofs = [
      ['#c67855','#9d4e3a','#663a32'],
      ['#8fa47c','#647d65','#465e50'],
      ['#ad9c74','#827150','#5b5241'],
    ]
    const roof = roofs[color % roofs.length]
    flat(x-.08,y-.05,w+.44,d+.36,.04,'#51533b')
    block(x,y,w,d,0,.18,['#8f816a','#756858','#615245'])
    block(x+.07,y+.07,w-.14,d-.14,.18,h,['#e4bd8b','#cda37a','#ae8969'])
    const top = h + .18
    const ax = x-.09, bx = x+w+.09, ay = y-.11, by = y+d+.11, ridge = x+w*.5
    polygon([[ax,by,top],[bx,by,top],[ridge,by,top+h*.65]], '#e1b484')
    polygon([[ax,ay,top],[ridge,ay,top+h*.65],[ridge,by,top+h*.65],[ax,by,top]], roof[0])
    polygon([[ridge,ay,top+h*.65],[bx,ay,top],[bx,by,top],[ridge,by,top+h*.65]], roof[1])
    for (let n = 1; n < 6; n++) {
      const left = ridge + (bx-ridge)*n/6
      const z = top+h*.65*(1-n/6)
      polygon([[left,ay,z],[left+.022,ay,z-.02],[left+.022,by,z-.02],[left,by,z]],roof[2])
    }
    for (const offset of [.24,.72]) {
      const a = x+w*offset, fy = y+d-.061, base = .37+h*.16
      polygon([[a-.18,fy,base-.04],[a+.17,fy,base-.04],[a+.17,fy,base+.4],[a-.18,fy,base+.4]], '#6e4937')
      polygon([[a-.126,fy+.003,base],[a+.115,fy+.003,base],[a+.115,fy+.003,base+.33],[a-.126,fy+.003,base+.33]], '#ffd68b')
      polygon([[a-.014,fy+.004,base],[a+.02,fy+.004,base],[a+.02,fy+.004,base+.33],[a-.014,fy+.004,base+.33]], '#9e6542')
    }
    const sx = x+w-.065, door = y+d*.57
    polygon([[sx,door,.18],[sx,door+.37,.18],[sx,door+.37,.82],[sx,door,.82]], '#694734')
    block(x+w-.05,door,.23,.41,0,.13,['#bcb19a','#897c69','#736858'])
    block(x+w*.63,y+d*.2,.21,.23,top+h*.36,.55,['#9b7160','#815447','#674136'])
  }

  function site(x: number, y: number, stage: number, color: number) {
    flat(x+.8,y+.8,3.48,3.48,.018,'#626a47')
    const path = '#a09369'
    flat(x+3.24,y+1.37,1.88,.51,.04,path)
    flat(x+3.22,y+1.37,.5,3.68,.04,path)
    if (stage < 2) {
      block(x+1.23,y+1.19,1.84,1.63,.025,.12,['#b0a082','#817759','#6d634c'])
      for (const [dx,dy] of [[1.32,1.28],[2.92,1.28],[1.32,2.67],[2.92,2.67]]) {
        block(x+dx,y+dy,.1,.1,.14,stage ? 1.13 : .26,['#d8ad74','#ab8052','#826441'])
      }
      if (stage) {
        block(x+1.32,y+1.28,1.7,.105,1.15,.12,['#e3b675','#ab8052','#826441'])
        block(x+1.32,y+2.67,1.7,.105,1.15,.12,['#e3b675','#ab8052','#826441'])
        block(x+1.38,y+1.28,.105,1.49,1.15,.12,['#e3b675','#ab8052','#826441'])
        block(x+1.38,y+2.57,1.62,.18,.14,.37,['#d0a47d','#ad805a','#8b684d'])
      }
      for (let i=0;i<4;i++) block(x+1.52+i*.15,y+3.1,.09,.57,.023,.09,['#be9863','#967241','#745b39'])
    } else {
      house(x+1.21,y+1.33,1.71,1.48,1.1,color)
      if (stage >= 3) house(x+2.03,y+3.21,1.06,1.01,.67,color+1)
    }
    tree(x+.79,y+3.21,.95,color%3===2)
    tree(x+4.05,y+.88,1.3,color%3===0)
    tree(x+4.45,y+1.15,.86)
    tree(x+.85,y+.67,.74)
    tree(x+4.19,y+3.74,1.0,color%3===1)
    for (let i=0;i<7;i++) {
      const px = x+.53+i*.47, py = y+4.33+(i%3)*.09
      flat(px,py,.08,.08,.038,i%2 ? '#c9ad70' : '#a4ac74')
    }
    block(x+3.83,y+2.17,.048,.048,0,.51,['#bd9663','#806646','#604d35'])
    block(x+3.79,y+2.13,.128,.128,.51,.14,['#ffe0a0','#f5c56d','#d29a53'])
  }

  const ground = ctx.createRadialGradient(width*.54,height*.45,0,width*.54,height*.45,width*.7)
  ground.addColorStop(0,'#393b2d'); ground.addColorStop(.58,'#2c3026'); ground.addColorStop(1,'#22271f')
  ctx.fillStyle = ground
  ctx.fillRect(0,0,width,height)
  for (let x=-12;x<24;x++) for (let y=-12;y<24;y++) {
    const [sx,sy] = project([x*1.3,y*1.3,-.32])
    ctx.fillStyle = (x+y)%4===0 ? '#a9a67b39' : '#a9a67b22'
    ctx.fillRect(sx,sy,1.5,1.5)
  }
  flat(.18,.18,maxX+.41,maxY+.41,-.73,'#1b201b')
  block(0,0,maxX,maxY,-.69,.69,['#737b51','#4c4a36','#3c3c2d'])
  for (let x=.14;x<maxX-.16;x+=.26) for (let y=.12;y<maxY-.14;y+=.29) {
    const n = Math.floor(x*17+y*31)
    if (n%5===0) flat(x,y,.11,.04,.007,n%2 ? '#7d8358' : '#9b9a6880')
  }
  flat(.27,maxY-.41,maxX-.54,.12,.021,'#9d9b6d')
  flat(maxX-.41,.27,.12,maxY-.54,.021,'#9d9b6d')
  positions.sort((a,b) => a.xy[0]+a.xy[1]-b.xy[0]-b.xy[1])
  if (!positions.length) {
    flat(1.34,1.39,2.7,2.54,.017,'#697250')
    tree(.89,3.6,1.23,true)
    tree(1.44,4.01,.86)
    tree(4.31,1.47,1.25)
    tree(4.09,3.96,1.16,true)
    tree(1.46,1.04,.76)
    block(3.12,3.37,.55,.19,.028,.15,['#c0976b','#947255','#735741'])
    return
  }
  for (const lot of positions) {
    const [x,y] = lot.xy
    if (lot.selected) flat(x+.44,y+.44,4.49,4.49,.012,'#a4a070')
    site(x,y,lot.stage,lot.color ?? lot.lot)
  }
}
