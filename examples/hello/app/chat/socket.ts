export default {
  open: (ws: any) => ws.subscribe('lobby'),
  message: (ws: any, m: unknown) => ws.publish('lobby', m),
}
