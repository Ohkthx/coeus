import http from 'http';
import express, {Express, NextFunction, Request, Response} from 'express';
import cmdRoutes from './routes/command';
import {DEFAULT_REST_PORT, restInfo} from '.';

const router: Express = express();

router.use(express.urlencoded({extended: false}));
router.use(express.json());

// REST API headers.
router.use((req: Request, res: Response, next: NextFunction) => {
  // CORS policy
  res.header('Access-Control-Allow-Origin', '*');

  // CORS headers
  res.header(
    'Access-Control-Allow-Headers',
    'origin, X-Requested-With,Content-Type,Accept, Authorization',
  );

  // CORS method headers
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET PATCH DELETE POST');
    return res.status(200).json({});
  }
  next();
});

// Catch invalid input passed by user.
router.use(
  (err: ErrorEvent, _req: Request, res: Response, next: NextFunction) => {
    if (err.type !== 'entity.parse.failed') return next(err);
    return res.status(400).json({message: 'bad request'});
  },
);

// Set the routes
router.use('/console', cmdRoutes);
router.use('/', (_req: Request, res: Response, _next: NextFunction) => {
  return res.status(200).json({
    message: 'Hello world!',
  });
});

// Handle errors with 404.
router.use((_req: Request, res: Response, _next: NextFunction) => {
  return res.status(404).json({
    message: 'not found',
  });
});

export class HTTPServer {
  static isActive: boolean = false;
  static server: http.Server = http.createServer(router);

  /**
   * Starts the rest server.
   */
  static async start() {
    HTTPServer.server.listen(DEFAULT_REST_PORT, () => {
      HTTPServer.isActive = true;
      restInfo(`started on port ${DEFAULT_REST_PORT}.`);
    });
  }

  /**
   * Stops the server.
   */
  static stop() {
    if (!HTTPServer.server) return;

    HTTPServer.server.close(() => {
      HTTPServer.isActive = false;
    });
  }
}
