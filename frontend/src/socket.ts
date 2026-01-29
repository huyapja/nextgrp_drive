import { io, Socket } from "socket.io-client"
import { socketio_port } from "../../../../sites/common_site_config.json"

function getCookie(name: string) {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()!.split(";").shift()
  return undefined
}

export function initSocket(): Socket {
  const host = window.location.hostname
  const isHttps = window.location.protocol === "https:"
  const protocol = isHttps ? "https" : "http"
  const port = socketio_port || 9000

  const site =
    window?.frappe?.boot?.site_name ||
    window?.frappe?.boot?.sitename

  const url = isHttps
    ? `${protocol}://${host}/${site}`
    : `${protocol}://${host}:${port}/${site}`

  console.log("🔗 Socket URL:", url)

  const socket = io(url, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: true,
  })

  socket.on("connect", () => {
    console.log("✅ THÀNH CÔNG!", socket.id)
  })

  socket.on("connect_error", (error) => {
    console.error("❌ Lỗi: ", error.message)
  })

  return socket
}


export class RealTimeHandler {
  open_docs: Set<string>
  socket: Socket
  subscribing: boolean

  constructor(socket) {
    this.open_docs = new Set()
    this.socket = socket
    this.subscribing = false
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.on(event, callback)
    }
  }

  off(event: string, callback: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.off(event, callback)
    }
  }

  emit(event: string, ...args: any[]) {
    this.socket.emit(event, ...args)
  }

  doc_subscribe(doctype: string, docname: string) {
    if (this.subscribing) {
      console.log("throttled")
      return
    }
    if (this.open_docs.has(`${doctype}:${docname}`)) {
      return
    }

    this.subscribing = true

    // throttle to 1 per sec
    setTimeout(() => {
      this.subscribing = false
    }, 1000)

    this.emit("doc_subscribe", doctype, docname)
    this.open_docs.add(`${doctype}:${docname}`)
  }
  doc_unsubscribe(doctype: string, docname: string) {
    this.emit("doc_unsubscribe", doctype, docname)
    return this.open_docs.delete(`${doctype}:${docname}`)
  }
  doc_open(doctype: string, docname: string) {
    this.emit("doc_open", doctype, docname)
  }
  doc_close(doctype: string, docname: string) {
    this.emit("doc_close", doctype, docname)
  }
  publish(event: string, message: any) {
    if (this.socket) {
      this.emit(event, message)
    }
  }
}
