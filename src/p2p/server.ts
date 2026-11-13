/**
 * WebRTC signaling over Raiko WebSockets. Peers in the same room find each
 * other and exchange offers, answers and ICE candidates; media and data then
 * flow peer to peer.
 *
 *   app.use(signaling({ path: '/p2p/:room', maxPeers: 8 }))
 */
import { Raiko } from '../app'
import type { RaikoSocket } from '../ws/types'

type Msg = { type: 'signal'; to: string; data: unknown }

export function signaling(o: { path?: string; maxPeers?: number } = {}) {
  const path = o.path ?? '/p2p/:room'
  const rooms = new Map<string, Map<string, RaikoSocket<any>>>()
  return new Raiko({ name: 'raiko:p2p' }).ws(path, {
    open(ws) {
      const room = String((ws.data.params as Record<string, string>).room ?? 'default')
      let peers = rooms.get(room)
      if (!peers) rooms.set(room, (peers = new Map()))
      if (peers.size >= (o.maxPeers ?? 16)) return ws.close(1008, 'Room is full')
      ws.send({ type: 'welcome', id: ws.id, peers: [...peers.keys()] })
      for (const p of peers.values()) p.send({ type: 'join', id: ws.id })
      peers.set(ws.id, ws)
    },
    message(ws, m: Msg) {
      if (!m || m.type !== 'signal' || typeof m.to !== 'string') return
      const room = String((ws.data.params as Record<string, string>).room ?? 'default')
      rooms.get(room)?.get(m.to)?.send({ type: 'signal', from: ws.id, data: m.data })
    },
    close(ws) {
      const room = String((ws.data.params as Record<string, string>).room ?? 'default')
      const peers = rooms.get(room)
      if (!peers) return
      peers.delete(ws.id)
      for (const p of peers.values()) p.send({ type: 'leave', id: ws.id })
      if (!peers.size) rooms.delete(room)
    },
  })
}
