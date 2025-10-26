import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { config } from './config/env.js';
import { logger } from './lib/logger.js';
import { requestContext } from './middlewares/requestContext.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { csrfProtection } from './middlewares/csrf.js';
import { authRoutes } from './routes/auth.routes.js';
import { productsRoutes } from './routes/products.routes.js';
import { pricesRoutes } from './routes/prices.routes.js';
import { inventoryRoutes } from './routes/inventory.routes.js';
import { suppliersRoutes } from './routes/suppliers.routes.js';
import { restaurantsRoutes } from './routes/restaurants.routes.js';
import { ordersRoutes } from './routes/orders.routes.js';
import { filesRoutes } from './routes/files.routes.js';
import { adminRoutes } from './routes/admin.routes.js';

const app = express();

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: config.WEB_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 auth requests per windowMs (increased for development)
  message: 'Too many authentication attempts, please try again later.',
});

app.use('/auth', authLimiter);
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session configuration
app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
  },
}));

// Request context middleware
app.use(requestContext);

// CSRF protection for state-changing operations
app.use(csrfProtection);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    ok: true, 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    requestId: req.requestId 
  });
});

// API routes
app.use('/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/prices', pricesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/restaurants', restaurantsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    ok: false,
    data: null,
    error: {
      name: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
    requestId: req.requestId,
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = config.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${config.NODE_ENV}`);
  logger.info(`Web origin: ${config.WEB_ORIGIN}`);
});

export default app;
