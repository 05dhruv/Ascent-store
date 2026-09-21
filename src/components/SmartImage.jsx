"use client";

import Image from "next/image";

/**
 * Thin next/image wrapper for catalog/store thumbnails.
 * Falls back to a plain img when the URL is empty or a data URI.
 */
export default function SmartImage({
  src,
  alt = "",
  width = 48,
  height = 48,
  className = "",
  unoptimized = false,
}) {
  const url = String(src || "").trim();
  if (!url) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  if (url.startsWith("data:") || url.startsWith("blob:")) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={url} alt={alt} width={width} height={height} className={className} />
    );
  }

  return (
    <Image
      src={url}
      alt={alt}
      width={width}
      height={height}
      className={className}
      unoptimized={unoptimized || url.includes("localhost")}
    />
  );
}
