import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { successResponse, validationError, errorResponse, notFoundError } from '@/lib/api-response';
import pool, { query } from '@/lib/db';
import { ensurePasswordResetsSchema } from '@/lib/passwordResetsSchema';
import { rateLimiters } from '@/lib/rate-limiter';
import { getUserIP } from '@/lib/api-protection';
import { ensureUsersTable } from '@/lib/userAuth';

/**
 * POST /api/auth/reset-password
 * Reset user password with valid reset token
 * 
 * Body: { token, newPassword, confirmPassword }
 * Response: { success: true, message: "Password reset successfully" }
 */
export async function POST(request) {
  try {
    await ensureUsersTable();
    await ensurePasswordResetsSchema();

    const body = await request.json();
    const { token, newPassword, confirmPassword } = body;
    const userIP = getUserIP(request);

    // ============================================
    // STEP 1: VALIDATE INPUT
    // ============================================

    if (!token || typeof token !== 'string') {
      return validationError({
        field: 'token',
        message: 'Valid reset token is required',
      });
    }

    if (!newPassword || typeof newPassword !== 'string') {
      return validationError({
        field: 'newPassword',
        message: 'New password is required',
      });
    }

    if (newPassword.length < 8) {
      return validationError({
        field: 'newPassword',
        message: 'Password must be at least 8 characters long',
      });
    }

    if (newPassword !== confirmPassword) {
      return validationError({
        field: 'confirmPassword',
        message: 'Passwords do not match',
      });
    }

    // Rate limit: 3 attempts per hour per IP
    const limiter = rateLimiters.resetPassword.check(userIP);
    if (!limiter.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many password reset attempts. Try again after ${limiter.resetTime.toLocaleTimeString()}`,
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((limiter.resetTime - new Date()) / 1000)),
          }
        }
      );
    }

    // ============================================
    // STEP 2: VERIFY TOKEN
    // ============================================

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();

    const resetResult = await query(
      `SELECT user_id FROM password_resets 
       WHERE token_hash = $1 AND expires_at > $2 AND used_at IS NULL
       LIMIT 1`,
      [tokenHash, now]
    );

    if (resetResult.rows.length === 0) {
      console.warn('[RESET_PASSWORD] Invalid or expired token attempt from IP:', userIP);
      return notFoundError('Password reset token is invalid or expired');
    }

    const userId = resetResult.rows[0].user_id;

    // ============================================
    // STEP 3: UPDATE PASSWORD
    // ============================================

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update password
      await client.query(
        `UPDATE users 
         SET password_hash = $1, updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, userId]
      );

      // Mark token as used
      await client.query(
        `UPDATE password_resets 
         SET used_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, status, details, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
        [userId, 'PASSWORD_RESET', 'USER', 'success', JSON.stringify({ ip: userIP })]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    console.log('[RESET_PASSWORD] Password reset successfully for user:', userId);

    return successResponse(null, 'Password reset successfully. You can now sign in with your new password.');

  } catch (err) {
    console.error('[RESET_PASSWORD] Error:', err.message);
    return errorResponse('Unable to reset password');
  }
}
