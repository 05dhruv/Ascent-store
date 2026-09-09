/**
 * UNIFIED API RESPONSE HANDLER
 * Purpose: Consistent response format across all APIs
 */

import { NextResponse } from 'next/server';

// ============================================
// RESPONSE STATUS CODES
// ============================================

const STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// ============================================
// SUCCESS RESPONSE
// ============================================

export function successResponse(data = null, message = 'Success', statusCode = STATUS.OK) {
  return NextResponse.json(
    {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    },
    { status: statusCode }
  );
}

// ============================================
// ERROR RESPONSE (VALIDATION)
// ============================================

export function validationError(errors, message = 'Validation failed') {
  return NextResponse.json(
    {
      success: false,
      message,
      errors: Array.isArray(errors) ? errors : [errors],
      timestamp: new Date().toISOString(),
    },
    { status: STATUS.BAD_REQUEST }
  );
}

// ============================================
// ERROR RESPONSE (UNAUTHORIZED)
// ============================================

export function unauthorizedError(message = 'Unauthorized') {
  return NextResponse.json(
    {
      success: false,
      message,
      error: 'UNAUTHORIZED',
      timestamp: new Date().toISOString(),
    },
    { status: STATUS.UNAUTHORIZED }
  );
}

// ============================================
// ERROR RESPONSE (FORBIDDEN/NO PERMISSION)
// ============================================

export function forbiddenError(message = 'Access denied') {
  return NextResponse.json(
    {
      success: false,
      message,
      error: 'FORBIDDEN',
      timestamp: new Date().toISOString(),
    },
    { status: STATUS.FORBIDDEN }
  );
}

// ============================================
// ERROR RESPONSE (NOT FOUND)
// ============================================

export function notFoundError(message = 'Resource not found') {
  return NextResponse.json(
    {
      success: false,
      message,
      error: 'NOT_FOUND',
      timestamp: new Date().toISOString(),
    },
    { status: STATUS.NOT_FOUND }
  );
}

// ============================================
// ERROR RESPONSE (DUPLICATE/CONFLICT)
// ============================================

export function conflictError(message = 'Resource already exists') {
  return NextResponse.json(
    {
      success: false,
      message,
      error: 'CONFLICT',
      timestamp: new Date().toISOString(),
    },
    { status: STATUS.CONFLICT }
  );
}

// ============================================
// ERROR RESPONSE (INTERNAL SERVER ERROR)
// ============================================

export function internalServerError(
  message = 'Internal server error',
  details = null
) {
  const response = {
    success: false,
    message,
    error: 'INTERNAL_SERVER_ERROR',
    timestamp: new Date().toISOString(),
  };

  // Only include details in development
  if (process.env.NODE_ENV === 'development' && details) {
    response.details = details;
  }

  return NextResponse.json(response, { status: STATUS.INTERNAL_SERVER_ERROR });
}

// ============================================
// PAGINATED RESPONSE
// ============================================

export function paginatedResponse(
  data,
  page = 1,
  pageSize = 10,
  total = 0,
  message = 'Success'
) {
  const totalPages = Math.ceil(total / pageSize);

  return NextResponse.json(
    {
      success: true,
      message,
      data,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total: Number(total),
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      timestamp: new Date().toISOString(),
    },
    { status: STATUS.OK }
  );
}

// ============================================
// ERROR RESPONSE (GENERIC)
// ============================================

export function errorResponse(
  message = 'An error occurred',
  statusCode = STATUS.INTERNAL_SERVER_ERROR,
  error = null
) {
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString(),
  };

  if (error && process.env.NODE_ENV === 'development') {
    response.error = {
      message: error.message,
      stack: error.stack,
    };
  }

  return NextResponse.json(response, { status: statusCode });
}

// ============================================
// TRY-CATCH WRAPPER FOR ASYNC HANDLERS
// ============================================

export function asyncHandler(handler) {
  return async (request, ...args) => {
    try {
      return await handler(request, ...args);
    } catch (err) {
      console.error('[asyncHandler error]', err);

      // Handle specific error types
      if (err.message.includes('Unauthorized')) {
        return unauthorizedError(err.message);
      }

      if (err.message.includes('Forbidden')) {
        return forbiddenError(err.message);
      }

      if (err.message.includes('not found')) {
        return notFoundError(err.message);
      }

      if (err.code === '23505') {
        // PostgreSQL unique violation
        return conflictError('Resource already exists');
      }

      // Default to internal server error
      return internalServerError(err.message);
    }
  };
}

export default {
  STATUS,
  successResponse,
  validationError,
  unauthorizedError,
  forbiddenError,
  notFoundError,
  conflictError,
  internalServerError,
  paginatedResponse,
  errorResponse,
  asyncHandler,
};