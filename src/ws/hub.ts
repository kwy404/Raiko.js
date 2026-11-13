import type { Connection } from './connection'

/** In process pub/sub for WebSocket topics. Same behavior on every runtime. */
export class Hub {
  private topics = new Map<string, Set<Connection>>()

  subscribe(topic: string, c: Connection) {
    let set = this.topics.get(topic)
    if (!set) this.topics.set(topic, (set = new Set()))
    set.add(c)
  }

  unsubscribe(topic: string, c: Connection) {
    const set = this.topics.get(topic)
    if (!set) return
    set.delete(c)
    if (set.size === 0) this.topics.delete(topic)
  }

  /** Returns how many sockets received the message. */
  publish(topic: string, data: unknown, except?: Connection): number {
    const set = this.topics.get(topic)
    if (!set) return 0
    let n = 0
    for (const c of set) {
      if (c === except) continue
      c.send(data)
      n++
    }
    return n
  }

  size(topic: string): number {
    return this.topics.get(topic)?.size ?? 0
  }
}

export function getHub(): Hub {
  const g = globalThis as { __raikoHub?: Hub }
  return (g.__raikoHub ??= new Hub())
}
