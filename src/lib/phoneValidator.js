/**
 * Validates that a phone number is exactly 10 digits
 * @param {string} phoneNumber - The phone number to validate
 * @returns {object} - { isValid: boolean, error?: string }
 */
export function validatePhoneNumber(phoneNumber) {
  if (!phoneNumber) {
    return { isValid: false, error: 'Phone number is required' };
  }

  const phoneStr = String(phoneNumber).trim();
  const digitsOnly = phoneStr.replace(/\D/g, '');

  if (digitsOnly.length !== 10) {
    return { isValid: false, error: 'Phone number must be exactly 10 digits' };
  }

  return { isValid: true };
}

/**
 * Checks if a phone number string has exactly 10 digits
 * @param {string} phoneNumber - The phone number to check
 * @returns {boolean} - True if valid (10 digits), false otherwise
 */
export function isValidPhoneNumber(phoneNumber) {
  const result = validatePhoneNumber(phoneNumber);
  return result.isValid;
}

/**
 * Gets error message if phone number is invalid
 * @param {string} phoneNumber - The phone number to validate
 * @returns {string|null} - Error message or null if valid
 */
export function getPhoneNumberError(phoneNumber) {
  const result = validatePhoneNumber(phoneNumber);
  return result.error || null;
}
