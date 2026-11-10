import {
  REFRESH_COOKIE,
  SESSION_COOKIE,
  refreshCookieOptions,
  sessionCookieOptions,
} from "../config/security.js";

/**
 * Guarda la sesión en cookies httpOnly. El navegador nunca puede leer el
 * access token ni el refresh token desde JavaScript.
 */
export const setSessionCookies = (res, session) => {
  if (!session?.access_token) return;

  res.cookie(SESSION_COOKIE, session.access_token, sessionCookieOptions);

  if (session.refresh_token) {
    res.cookie(REFRESH_COOKIE, session.refresh_token, refreshCookieOptions);
  }
};

const withoutMaxAge = ({ maxAge, ...options }) => options;

export const clearSessionCookies = (res) => {
  res.clearCookie(SESSION_COOKIE, withoutMaxAge(sessionCookieOptions));
  res.clearCookie(REFRESH_COOKIE, withoutMaxAge(refreshCookieOptions));
};

export const getAccessToken = (req) => req.cookies?.[SESSION_COOKIE] || null;

export const getRefreshToken = (req) => req.cookies?.[REFRESH_COOKIE] || null;
