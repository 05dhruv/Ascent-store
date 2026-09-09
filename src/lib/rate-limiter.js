/**
 * RATE LIMITER
 * Prevents brute force attacks and API abuse
 * Uses in-memory storage (can upgrade to Redis for distributed systems)
 */

const limiters = new Map();

/**
 * Rate limit configuration
 * Key format: `${type}:${identifier}` (e.g., `login:192.168.1.1`)
 */
export function createRateLimiter(name, maxAttempts, windowMs) {
  return {
    name,
    maxAttempts,
    windowMs, // milliseconds
    check: (identifier) => checkRateLimit(`${name}:${identifier}`, maxAttempts, windowMs),
    reset: (identifier) => resetRateLimit(`${name}:${identifier}`),
  };
}

/**
 * Predefined rate limiters
 */
export const rateLimiters = {
  // Login: 5 attempts per 15 minutes
  login: createRateLimiter('login', 5, 15 * 60 * 1000),
  
  // General API: 100 requests per 15 minutes
  api: createRateLimiter('api', 100, 15 * 60 * 1000),
  
  // Forgot Password: 3 attempts per hour
  forgotPassword: createRateLimiter('forgot_password', 3, 60 * 60 * 1000),
  
  // Password Reset: 3 attempts per hour
  resetPassword: createRateLimiter('reset_password', 3, 60 * 60 * 1000),
};

/**
 * Check if request is rate limited
 * Returns { allowed: boolean, remaining: number, resetTime: Date }
 */
function checkRateLimit(key, maxAttempts, windowMs) {
  const now = Date.now();

  // Initialize or get existing record
  if (!limiters.has(key)) {
    limiters.set(key, {
      attempts: [],
      created: now,
    });
  }

  const record = limiters.get(key);

  // Clean old attempts (outside window)
  record.attempts = record.attempts.filter(time => now - time < windowMs);

  // Check if limit exceeded
  const remaining = maxAttempts - record.attempts.length;
  const allowed = remaining > 0;

  if (allowed) {
    // Add this attempt
    record.attempts.push(now);
  }

  // Calculate reset time
  const oldestAttempt = record.attempts[0];
  const resetTime = oldestAttempt 
    ? new Date(oldestAttempt + windowMs)
    : new Date(now + windowMs);

  return {
    allowed,
    attempts: record.attempts.length,
    maxAttempts,
    remaining: Math.max(0, remaining),
    resetTime,
  };
}

/**
 * Reset rate limit for a key (e.g., successful login)
 */
function resetRateLimit(key) {
  limiters.delete(key);
}

/**
 * Get rate limit status
 */
function getRateLimitStatus(key) {
  return limiters.get(key) || { attempts: [], created: null };
}

/**
 * Create rate limit response headers
 */
export function rateLimitHeaders(limiterResult) {
  return {
    'X-RateLimit-Limit': String(limiterResult.maxAttempts),
    'X-RateLimit-Remaining': String(limiterResult.remaining),
    'X-RateLimit-Reset': limiterResult.resetTime.toISOString(),
  };
}

/**
 * Cleanup expired entries (run periodically)
 */
export function cleanupOldEntries() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  for (const [key, record] of limiters.entries()) {
    if (now - record.created > maxAge) {
      limiters.delete(key);
    }
  }
}

// Run cleanup every hour
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupOldEntries, 60 * 60 * 1000);
}

export default { checkRateLimit, resetRateLimit, getRateLimitStatus };
