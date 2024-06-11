import { Middleware, KoaMiddlewareInterface } from 'routing-controllers';

@Middleware({ type: 'after' })
export class CheckTokenMiddleware implements KoaMiddlewareInterface {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  use(ctx: any, next: (err?: any) => Promise<any>): Promise<any> {
    return next();
  }

}
