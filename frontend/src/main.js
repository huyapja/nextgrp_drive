import emitter from "@/emitter"
import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'
import {
  Button,
  frappeRequest,
  FrappeUI,
  onOutsideClickDirective,
  setConfig,
} from "frappe-ui"
import 'primeicons/primeicons.css'
import PrimeVue from 'primevue/config'
import { createApp } from "vue"
import VueTippy from "vue-tippy"

// Custom theme preset
const customPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{blue.50}',
      100: '{blue.100}',
      200: '{blue.200}',
      300: '{blue.300}',
      400: '{blue.400}',
      500: '#0149C1', // Màu primary của bạn
      600: '#013a9c',
      700: '{blue.700}',
      800: '{blue.800}',
      900: '{blue.900}',
      950: '{blue.950}'
    }
  }
})

import App from "./App.vue"
import "./index.css"
import router from "./router"
import { initSocket, RealTimeHandler } from "./socket"
import store from "./store"
import translationPlugin from "./translation"
import { handleResourceError } from "./utils/errorHandler"
import { toast } from "./utils/toasts"

const app = createApp(App)

setConfig("resourceFetcher", frappeRequest)
app.config.unwrapInjectedRef = true
app.config.globalProperties.emitter = emitter
app.provide("emitter", emitter)
app.use(translationPlugin)
app.use(router)
app.use(store)

// Cấu hình PrimeVue với theme custom
app.use(PrimeVue, {
  theme: {
    preset: customPreset,
    options: {
      prefix: 'p',
      darkModeSelector: false,
      cssLayer: false
    }
  }
})

app.use(FrappeUI, { socketio: false })
const socket = initSocket()
const realtime = new RealTimeHandler(socket)
app.provide("realtime", realtime)
app.provide("socket", socket)
app.config.globalProperties.$realtime = realtime
app.config.globalProperties.$socket = socket
app.directive("on-outside-click", onOutsideClickDirective)
app.use(
  VueTippy,
  {
    directive: "tippy",
    component: "tippy",
  }
)
app.directive("focus", {
  mounted: (el) => el.focus(),
})

setConfig("resourceFetcher", (options) => {
  return frappeRequest({
    ...options,
    onError(err) {
      // Xử lý lỗi mất kết nối mạng trước
      if (handleResourceError(err)) {
        // Đã xử lý lỗi mạng, không cần xử lý thêm
        return
      }
      
      // Xử lý các lỗi khác
      if (err.messages && err.messages[0]) {
        return
      }
    },
  })
})

app.component("Button", Button)

// Xử lý sự kiện online/offline để thông báo mất kết nối mạng
if (typeof window !== 'undefined') {
  let offlineToastId = null
  
  window.addEventListener('online', () => {
    // Kết nối lại mạng
    if (offlineToastId) {
      // Có thể thêm logic để remove toast offline nếu cần
    }
    toast({
      title: "Đã kết nối lại",
      text: "Kết nối mạng đã được khôi phục",
      icon: "check-circle",
      iconClasses: "text-green-600",
      background: "bg-surface-green-2",
      position: "bottom-right",
      timeout: 3,
    })
  })
  
  window.addEventListener('offline', () => {
    // Mất kết nối mạng
    offlineToastId = toast({
      title: "Thất bại",
      text: "Vui lòng kiểm tra kết nối mạng và thử lại",
      icon: "x",
      iconClasses: "text-red-600",
      background: "bg-surface-red-2",
      position: "bottom-right",
      timeout: null, // Không tự động đóng khi mất mạng
    })
  })
}

app.mount("#app")