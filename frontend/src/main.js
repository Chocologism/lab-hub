import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import 'katex/dist/katex.min.css'
import './index.css'

import { applyThemeToDOM, currentColorScheme, currentBgType } from './composables/useThemeStyle'
import { initCustomFont } from './composables/useCustomFont'

applyThemeToDOM(currentColorScheme.value, currentBgType.value)
initCustomFont()

const app = createApp(App)
app.use(router)
app.mount('#app')
