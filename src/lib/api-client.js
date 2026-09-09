/**
 * Centralized API Client for Frontend (JavaScript)
 * Handles: Authentication, Error handling, Retry logic, Request/Response transformation
 */

export class ApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

class ApiClient {
  constructor(baseUrl) {
    const isBrowser = typeof window !== 'undefined';
    this.baseUrl = baseUrl || (isBrowser ? '' : process.env.NEXT_PUBLIC_BACKEND_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001'));
    this.timeout = 30000; // 30 seconds default
  }

  /**
   * Get JWT token from localStorage
   */
  getToken() {
    try {
      if (typeof window !== 'undefined') {
        return localStorage.getItem('token');
      }
    } catch (e) {
      console.warn('Failed to get token from storage:', e);
    }
    return null;
  }

  /**
   * Set JWT token in localStorage
   */
  setToken(token) {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', token);
      }
    } catch (e) {
      console.error('Failed to set token in storage:', e);
    }
  }

  /**
   * Clear JWT token
   */
  clearToken() {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
      }
    } catch (e) {
      console.error('Failed to clear token:', e);
    }
  }

  /**
   * Build request headers with authentication
   */
  buildHeaders(customHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Retry logic with exponential backoff
   */
  async retryWithBackoff(fn, maxAttempts = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        // Don't retry on client errors (4xx)
        if (error.status >= 400 && error.status < 500) {
          throw error;
        }

        if (attempt === maxAttempts) {
          throw error;
        }

        const backoffDelay = delay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Main API request method
   */
  async request(endpoint, options = {}) {
    const {
      timeout = this.timeout,
      headers: customHeaders = {},
      ...restOptions
    } = options;

    const url = `${this.baseUrl}${endpoint}`;
    const headers = this.buildHeaders(customHeaders);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...restOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 401 Unauthorized - clear token and redirect to login
      if (response.status === 401) {
        this.clearToken();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        throw new ApiError('Unauthorized - please login again', 401);
      }

      const responseData = await response.json();

      if (!response.ok) {
        throw new ApiError(
          responseData.error?.message || 'Request failed',
          response.status,
          responseData.error?.details
        );
      }

      return responseData.data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error.name === 'AbortError') {
        throw new ApiError('Request timeout', 408);
      }

      throw new ApiError(error.message || 'Network error', 0);
    }
  }

  /**
   * GET request
   */
  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post(endpoint, data = null, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put(endpoint, data = null, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * PATCH request
   */
  async patch(endpoint, data = null, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

export default ApiClient;
