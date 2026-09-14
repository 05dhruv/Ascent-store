"use client";

import AuthScreen from "@/components/AuthScreen";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { getDefaultRouteForUser } from "@/lib/accessControl";
import { fetchAuthEndpoint } from "@/lib/auth-endpoints";

const highlights = [
  {
    icon: "ti-bolt",
    title: "Accept payments instantly",
    text: "Contactless, links and invoices settled to your account in real time.",
  },
  {
    icon: "ti-chart-bar",
    title: "Track performance",
    text: "Live dashboards and exportable reports for every storefront.",
  },
  {
    icon: "ti-building-store",
    title: "Multi-Outlet Management",
    text: "Centralizes control, structures operations, and ensures consistency across all outlets.",
  },
  {
    icon: "ti-sparkles",
    title: "AI-powered insights",
    text: "Smart trends and recommendations to grow daily revenue.",
  },
];

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [autoChecking, setAutoChecking] = useState(true);
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const resolveRedirect = async (fallback = "/home") => {
    const explicitNext = searchParams?.get("next");
    if (explicitNext) return explicitNext;

    try {
      const res = await fetchAuthEndpoint("/api/auth/me");
      const json = await res.json();
      return json?.data?.user
        ? getDefaultRouteForUser(json.data.user)
        : fallback;
    } catch {
      return fallback;
    }
  };

  const normalizeRedirectLocation = (location) => {
    if (!location) return "";
    try {
      return new URL(location, window.location.origin).pathname;
    } catch {
      return location.startsWith("/") ? location : "";
    }
  };

  // ============================================
  // Handle Form Input Changes
  // ============================================

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (error) {
      setError("");
    }
  };

  // ============================================
  // Handle Login Form Submission
  // ============================================

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    console.log("[LOGIN PAGE] Submitting login form");

    try {
      // Validate form fields
      if (!form.email || !form.password) {
        setError("Please enter both email and password");
        setLoading(false);
        return;
      }

      console.log("[LOGIN PAGE] Sending login request to /api/auth/login");

      // Make login request to API
      // Don't follow redirects - we'll handle them ourselves
      const res = await fetchAuthEndpoint("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "manual", // Don't follow redirects automatically
        body: JSON.stringify({
          email: form.email,
          password: form.password,
        }),
      });

      console.log("[LOGIN PAGE] Login response status:", res.status);
      console.log("[LOGIN PAGE] Login response type:", res.type);

      // Handle redirect response (302)
      if (res.status === 302 || res.type === "opaqueredirect") {
        console.log("[LOGIN PAGE] Redirect response received");
        const redirectFromApi = normalizeRedirectLocation(
          res.headers.get("location"),
        );
        window.location.href =
          redirectFromApi || (await resolveRedirect("/home"));
        return;
      }

      // Handle normal response (200)
      if (res.status === 200) {
        const json = await res.json();
        console.log("[LOGIN PAGE] Login response:", {
          success: json.success,
          message: json.message,
          hasUser: !!json.data?.user,
        });

        if (json.success) {
          console.log("[LOGIN PAGE] Login successful");
          window.location.href = json.data?.user
            ? getDefaultRouteForUser(json.data.user)
            : await resolveRedirect("/home");
          return;
        }

        // Success false but 200 status
        setError(json.message || "Login failed");
        setLoading(false);
        return;
      }

      // Handle error response (400, 401, 500, etc)
      const json = await res.json();
      console.error("[LOGIN PAGE] Login failed:", json.message);
      setError(json.message || "Unable to login. Please try again.");
      setLoading(false);
    } catch (err) {
      console.error("[LOGIN PAGE] Login error:", err);
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  // ============================================
  // Auto-check if user is already authenticated
  // ============================================

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        console.log("[LOGIN PAGE] Checking if user is already authenticated");

        // Check authentication status
        const res = await fetchAuthEndpoint("/api/auth/me");

        if (!mounted) return;

        const json = await res.json();

        if (res.ok && json?.data?.user) {
          const redirectTo =
            searchParams?.get("next") || getDefaultRouteForUser(json.data.user);
          console.log(
            "[LOGIN PAGE] User already authenticated, redirecting to:",
            redirectTo,
          );
          // User is already logged in, redirect to home/dashboard
          window.location.href = redirectTo;
          return;
        }

        console.log("[LOGIN PAGE] User not authenticated");
      } catch (e) {
        console.error("[LOGIN PAGE] Auth check error:", e.message);
        // Silently fail - user just needs to login
      } finally {
        if (mounted) {
          setAutoChecking(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Show loading state while checking authentication
  if (autoChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 inline-block">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600"></div>
          </div>
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthScreen
      brandTitle="Ascent Sync"
      brandTagline="Construction material control, from warehouse to site."
      leftPanelKicker="Ascent Sync"
      leftPanelTitle="Material control for every construction site."
      leftPanelSubtitle="Track warehouse receipts, site transfers, material issues and live stock movement in one place."
      eyebrow="Welcome back."
      title="Sign in to continue."
      subtitle=""
      footerText="Registration is handled by the admin team."
      highlights={highlights}
    >
      <form className="space-y-3.5" onSubmit={handleSubmit}>
        {/* Email Field */}
        <div>
          <label
            htmlFor="login-email"
            className="mb-1.5 block text-[12px] font-medium text-gray-700"
          >
            Email
          </label>
          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 transition-colors focus-within:border-blue-400 focus-within:bg-white">
            <i className="ti ti-user text-[16px] text-gray-400" />
            <input
              id="login-email"
              type="email"
              name="email"
              value={form.email}
              onChange={onChange}
              placeholder="admin@buyzaarsync.com"
              required
              disabled={loading}
              className="w-full bg-transparent text-[13px] text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <label
            htmlFor="login-password"
            className="mb-1.5 block text-[12px] font-medium text-gray-700"
          >
            Password
          </label>
          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 transition-colors focus-within:border-blue-400 focus-within:bg-white">
            <i className="ti ti-lock text-[16px] text-gray-400" />
            <input
              id="login-password"
              type="password"
              name="password"
              value={form.password}
              onChange={onChange}
              placeholder="at least 6 characters"
              required
              disabled={loading}
              className="w-full bg-transparent text-[13px] text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-700 animate-in fade-in">
            <div className="flex items-start gap-2">
              <i className="ti ti-alert-circle mt-0.5 flex-shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Forgot Password Link */}
        <div className="flex items-center justify-between gap-3 text-[12px]">
          <a
            href="#"
            className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Forgot password?
          </a>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !form.email || !form.password}
          className="w-full rounded-2xl bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600 disabled:hover:shadow-lg disabled:hover:shadow-blue-600/20"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              <span>Signing in...</span>
            </div>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </AuthScreen>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
