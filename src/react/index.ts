/**
 * React hooks for a Raiko backend.
 *
 *   const { data, loading, error, refetch } = useQuery(() => api.get('/users'))
 *   const save = useMutation((u: User) => api.post('/users', { body: u }))
 *   const chat = useSocket(() => api.ws('/chat'), (msg) => setMessages((m) => [...m, msg]))
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientResult } from '../client'
import type { RaikoClientSocket } from '../client/socket'

type Fetcher<D, E> = (signal: AbortSignal) => Promise<ClientResult<D, E>>

const cache = new Map<string, { data: unknown; at: number }>()

export function useQuery<D, E = unknown>(
  fn: Fetcher<D, E> | (() => Promise<ClientResult<D, E>>),
  o: { key?: string; enabled?: boolean; staleTime?: number; refetchInterval?: number; deps?: unknown[] } = {},
) {
  const cached = o.key ? (cache.get(o.key)?.data as D | undefined) : undefined
  const [data, setData] = useState<D | null>(cached ?? null)
  const [error, setError] = useState<ClientResult<D, E>['error']>(null)
  const [loading, setLoading] = useState(cached === undefined && o.enabled !== false)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const run = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const r = await (fnRef.current as Fetcher<D, E>)(signal ?? new AbortController().signal)
    if (signal?.aborted) return
    setData(r.data)
    setError(r.error)
    setLoading(false)
    if (o.key && r.data !== null) cache.set(o.key, { data: r.data, at: Date.now() })
  }, [o.key])

  useEffect(() => {
    if (o.enabled === false) return
    const hit = o.key ? cache.get(o.key) : undefined
    if (hit && Date.now() - hit.at < (o.staleTime ?? 0)) return
    const ac = new AbortController()
    run(ac.signal)
    const timer = o.refetchInterval ? setInterval(() => run(ac.signal), o.refetchInterval) : undefined
    return () => {
      ac.abort()
      if (timer) clearInterval(timer)
    }
  }, [run, o.enabled, o.refetchInterval, ...(o.deps ?? [])])

  return { data, error, loading, refetch: () => run(), setData }
}

export function useMutation<A extends unknown[], D, E = unknown>(fn: (...args: A) => Promise<ClientResult<D, E>>, o: { onSuccess?: (d: D) => void; onError?: (e: unknown) => void } = {}) {
  const [state, setState] = useState<{ data: D | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: false })
  const mutate = useCallback(async (...args: A) => {
    setState((s) => ({ ...s, loading: true }))
    const r = await fn(...args)
    setState({ data: r.data, error: r.error, loading: false })
    if (r.error) o.onError?.(r.error)
    else if (r.data !== null) o.onSuccess?.(r.data)
    return r
  }, [fn])
  return { ...state, mutate }
}

/** Opens the socket on mount, closes it on unmount. */
export function useSocket<In, Out>(open: () => RaikoClientSocket<In, Out>, onMessage?: (m: In) => void) {
  const [connected, setConnected] = useState(false)
  const [last, setLast] = useState<In | null>(null)
  const ref = useRef<RaikoClientSocket<In, Out> | null>(null)
  const handler = useRef(onMessage)
  handler.current = onMessage
  useEffect(() => {
    const s = open()
    ref.current = s
    const offs = [
      s.on('open', () => setConnected(true)),
      s.on('close', () => setConnected(false)),
      s.on('message', (m) => {
        setLast(m)
        handler.current?.(m)
      }),
    ]
    return () => {
      offs.forEach((f) => f())
      s.close()
    }
  }, [])
  return { connected, last, send: (m: Out) => ref.current?.send(m), socket: ref }
}
