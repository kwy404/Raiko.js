/**
 * Vue composables for a Raiko backend.
 *
 *   const { data, loading, error, refetch } = useQuery(() => api.get('/users'))
 *   const { send, last, connected } = useSocket(() => api.ws('/chat'))
 */
import { onMounted, onUnmounted, ref, shallowRef, type Ref } from 'vue'
import type { ClientResult } from '../client'
import type { RaikoClientSocket } from '../client/socket'

export function useQuery<D, E = unknown>(fn: () => Promise<ClientResult<D, E>>, o: { immediate?: boolean; refetchInterval?: number } = {}) {
  const data = shallowRef<D | null>(null) as Ref<D | null>
  const error = shallowRef<unknown>(null)
  const loading = ref(false)
  const refetch = async () => {
    loading.value = true
    const r = await fn()
    data.value = r.data
    error.value = r.error
    loading.value = false
    return r
  }
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    if (o.immediate !== false) refetch()
    if (o.refetchInterval) timer = setInterval(refetch, o.refetchInterval)
  })
  onUnmounted(() => timer && clearInterval(timer))
  return { data, error, loading, refetch }
}

export function useMutation<A extends unknown[], D, E = unknown>(fn: (...args: A) => Promise<ClientResult<D, E>>) {
  const data = shallowRef<D | null>(null) as Ref<D | null>
  const error = shallowRef<unknown>(null)
  const loading = ref(false)
  const mutate = async (...args: A) => {
    loading.value = true
    const r = await fn(...args)
    data.value = r.data
    error.value = r.error
    loading.value = false
    return r
  }
  return { data, error, loading, mutate }
}

export function useSocket<In, Out>(open: () => RaikoClientSocket<In, Out>, onMessage?: (m: In) => void) {
  const connected = ref(false)
  const last = shallowRef<In | null>(null) as Ref<In | null>
  let s: RaikoClientSocket<In, Out> | null = null
  onMounted(() => {
    s = open()
    s.on('open', () => (connected.value = true))
    s.on('close', () => (connected.value = false))
    s.on('message', (m) => {
      last.value = m
      onMessage?.(m)
    })
  })
  onUnmounted(() => s?.close())
  return { connected, last, send: (m: Out) => s?.send(m) }
}
