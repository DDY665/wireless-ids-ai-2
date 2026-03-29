// Request logging middleware with structured JSON output
function requestLogger(req, res, next) {
  const startTime = Date.now();

  // Capture response end
  const originalEnd = res.end;
  res.end = function (chunk, encoding) {
    const duration = Date.now() - startTime;

    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      userAgent: req.get('user-agent'),
      ip: req.ip
    };

    // Log to console (structured JSON)
    console.log(JSON.stringify(logEntry));

    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Error logging middleware
function errorLogger(err, req, res, next) {
  const errorEntry = {
    timestamp: new Date().toISOString(),
    type: 'ERROR',
    method: req.method,
    path: req.path,
    error: err.message,
    errorName: err.name,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    ip: req.ip
  };

  console.error(JSON.stringify(errorEntry));
  next(err);
};

module.exports = { requestLogger, errorLogger };
