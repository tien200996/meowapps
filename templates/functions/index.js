import { MeowBackend } from 'meowapps/functions'
import { AppRoutes } from './app-routes.js'

export const { handleApi, proxyEmulator } = MeowBackend.createFunctions({
  '/api/hello': AppRoutes.sayHello,
})
