import { APP_NAME } from "@/lib/brand";

interface BrandLogoProps {
  width: number;
  height: number;
  alt?: string;
  className?: string;
}

export function BrandLogo({
  width,
  height,
  alt = `${APP_NAME} logo`,
  className = "",
}: BrandLogoProps) {
  return (
    <img
      alt={alt}
      className={`brand-logo-image ${className}`}
      decoding="async"
      height={height}
      src="/brand/logo-mark.png"
      srcSet="/brand/logo-mark.png 1x, /brand/logo-mark@2x.png 2x"
      width={width}
    />
  );
}
