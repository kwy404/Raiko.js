/**
 * Browser side of P2P: full mesh of RTCPeerConnections with a data channel
 * per peer, optional media streams, perfect negotiation.
 *
 *   const room = joinRoom(api.ws('/p2p/lobby'))
 *   room.on('message', (from, data) => ...)
 *   room.send({ hi: true })
 */
import type { RaikoClientSocket } from '../client/socket'

type Signal = { type: 'welcome'; id: string; peers: string[] } | { type: 'join' | 'leave'; id: string } | { type: 'signal'; from: string; data: any }

export interface RoomOptions {
  iceServers?: RTCIceServer[]
  stream?: MediaStream
}

export function joinRoom(socket: RaikoClientSocket<any, any>, o: RoomOptions = {}) {
  const peers = new Map<string, { pc: RTCPeerConnection; dc?: RTCDataChannel; polite: boolean; makingOffer: boolean }>()
  const handlers = { message: new Set<(from: string, data: unknown) => void>(), peer: new Set<(id: string) => void>(), leave: new Set<(id: string) => void>(), stream: new Set<(id: string, s: MediaStream) => void>() }
  let self = ''
  const iceServers = o.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }]
  const signal = (to: string, data: unknown) => socket.send({ type: 'signal', to, data })

  const wire = (id: string, dc: RTCDataChannel) => {
    peers.get(id)!.dc = dc
    dc.onopen = () => handlers.peer.forEach((f) => f(id))
    dc.onmessage = (e) => {
      let v: unknown = e.data
      try { v = JSON.parse(e.data) } catch {}
      handlers.message.forEach((f) => f(id, v))
    }
  }

  const connect = (id: string, initiator: boolean) => {
    const pc = new RTCPeerConnection({ iceServers })
    const entry = { pc, polite: self < id, makingOffer: false }
    peers.set(id, entry)
    o.stream?.getTracks().forEach((t) => pc.addTrack(t, o.stream!))
    pc.ontrack = (e) => e.streams[0] && handlers.stream.forEach((f) => f(id, e.streams[0]!))
    pc.onicecandidate = (e) => e.candidate && signal(id, { candidate: e.candidate })
    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true
        await pc.setLocalDescription()
        signal(id, { description: pc.localDescription })
      } finally {
        entry.makingOffer = false
      }
    }
    pc.ondatachannel = (e) => wire(id, e.channel)
    if (initiator) wire(id, pc.createDataChannel('raiko'))
    return entry
  }

  socket.on('message', async (m: Signal) => {
    if (m.type === 'welcome') {
      self = m.id
      for (const p of m.peers) connect(p, true)
    } else if (m.type === 'leave') {
      peers.get(m.id)?.pc.close()
      peers.delete(m.id)
      handlers.leave.forEach((f) => f(m.id))
    } else if (m.type === 'signal') {
      const entry = peers.get(m.from) ?? connect(m.from, false)
      const { pc } = entry
      const { description, candidate } = m.data ?? {}
      if (description) {
        const collision = description.type === 'offer' && (entry.makingOffer || pc.signalingState !== 'stable')
        if (collision && !entry.polite) return
        await pc.setRemoteDescription(description)
        if (description.type === 'offer') {
          await pc.setLocalDescription()
          signal(m.from, { description: pc.localDescription })
        }
      } else if (candidate) await pc.addIceCandidate(candidate).catch(() => {})
    }
  })

  return {
    get id() { return self },
    get peers() { return [...peers.keys()] },
    /** send to every peer, or one peer with `to` */
    send(data: unknown, to?: string) {
      const msg = typeof data === 'string' ? data : JSON.stringify(data)
      for (const [id, p] of peers) if ((!to || to === id) && p.dc?.readyState === 'open') p.dc.send(msg)
    },
    on<K extends keyof typeof handlers>(event: K, fn: Parameters<(typeof handlers)[K]['add']>[0]) {
      ;(handlers[event] as Set<unknown>).add(fn)
      return () => (handlers[event] as Set<unknown>).delete(fn)
    },
    leave() {
      for (const p of peers.values()) p.pc.close()
      peers.clear()
      socket.close()
    },
  }
}
