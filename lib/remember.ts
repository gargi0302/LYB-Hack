// "Remember me" on the sign-in page. Supabase keeps the login in localStorage, so it survives closing
// the browser. When the box is unticked we also set a browser-session cookie (no expiry date, so the
// browser drops it on close); a later visit without that cookie signs out first.
const FORGET = "forget-login";
const ALIVE = "login-alive=1";

export function rememberLogin(remember: boolean) {
  try {
    if (remember) localStorage.removeItem(FORGET);
    else {
      localStorage.setItem(FORGET, "1");
      document.cookie = `${ALIVE}; path=/; SameSite=Lax`;
    }
  } catch {
    // storage blocked (private mode): the login only lasts this session anyway
  }
}

// true when the user asked not to be remembered and the browser has been closed since
export function loginExpired() {
  try {
    return localStorage.getItem(FORGET) === "1" && !document.cookie.split("; ").includes(ALIVE);
  } catch {
    return false;
  }
}
