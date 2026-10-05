export class AppRoutes {
  static sayHello(httpRequest, httpResponse, { shopId }) {
    httpResponse.json({ shopId })
  }
}
