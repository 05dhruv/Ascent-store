"use client";

import Link from "next/link";

const VARIANTS = {
  primary: "ui-button",
  secondary: "ui-button ui-button--secondary",
  accent: "ui-button ui-button--accent",
  danger: "ui-button ui-button--danger",
  ghost: "ui-button ui-button--ghost",
};

const SIZES = {
  md: "",
  sm: "ui-button--sm",
};

/**
 * Shared button. Renders a Next.js <Link> when `href` is given, otherwise a <button>.
 * `icon` is a Tabler class such as "ti ti-plus".
 */
export default function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  href,
  type = "button",
  className = "",
  disabled,
  children,
  ...props
}) {
  const classes = [VARIANTS[variant] || VARIANTS.primary, SIZES[size], className]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {loading ? (
        <i className="ti ti-loader-2 animate-spin" aria-hidden="true" />
      ) : icon ? (
        <i className={icon} aria-hidden="true" />
      ) : null}
      {children}
      {iconRight ? <i className={iconRight} aria-hidden="true" /> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {content}
    </button>
  );
}
