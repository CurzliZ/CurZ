import { ArrowUpRight, Check, CircleHelp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_NAME } from "@/lib/brand";

const colorTokens = [
  ["Background", "--background"],
  ["Surface", "--surface"],
  ["Raised", "--raised"],
  ["Border", "--border"],
  ["Text", "--foreground"],
  ["Muted", "--muted-foreground"],
  ["Accent", "--primary"],
];

const relationshipTokens = [
  ["Supports", "--relationship-supports"],
  ["Extends", "--relationship-extends"],
  ["Example", "--relationship-example"],
  ["Depends", "--relationship-depends"],
  ["Inspired", "--relationship-inspired"],
  ["Tension", "--relationship-tension"],
];

const typeSamples = [
  { name: "Display", size: "48px", className: "type-sample-display", text: "Ideas, in context." },
  { name: "Section", size: "24px", className: "type-sample-display", text: "A little more clarity." },
  { name: "Body", size: "14px", className: "", text: "For reading, navigation, and everyday work." },
  { name: "Caption", size: "12px", className: "", text: "Quiet labels and helpful detail." },
  { name: "Code", size: "12px", className: "font-mono", text: "local-first / notes.md" },
];

export function DesignPage() {
  return (
    <div className="design-page">
      <header className="design-intro">
        <div>
          <p className="eyebrow">{APP_NAME} / foundation</p>
          <h1 className="design-title">Design system</h1>
          <p className="design-lede">
            A quiet, precise visual language for following ideas without
            getting in their way.
          </p>
        </div>
        <span className="design-theme-note">
          <span className="status-dot" aria-hidden="true" />
          Theme follows the app toggle
        </span>
      </header>

      <section aria-labelledby="color-heading" className="design-section">
        <div>
          <p className="eyebrow">01 / foundation</p>
          <h2 id="color-heading">Color tokens</h2>
        </div>
        <div className="token-grid">
          {colorTokens.map(([label, token]) => (
            <div className="token-swatch" key={token}>
              <span
                aria-hidden="true"
                className="swatch-color"
                style={{ backgroundColor: `var(${token})` }}
              />
              <span className="swatch-label">
                {label}
                <span className="swatch-value">{token}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="contrast-note">
          Primary and muted text meet WCAG AA on both themes. Faint is reserved
          for non-text detail.
        </p>
      </section>

      <section aria-labelledby="type-heading" className="design-section">
        <div>
          <p className="eyebrow">02 / typography</p>
          <h2 id="type-heading">Type scale</h2>
        </div>
        <div className="type-scale">
          {typeSamples.map((sample) => (
            <div className="type-sample" key={sample.name}>
              <span className="type-sample-value">
                {sample.name} / {sample.size}
              </span>
              <span className={sample.className}>{sample.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="relationship-heading" className="design-section">
        <div>
          <p className="eyebrow">03 / meaning</p>
          <h2 id="relationship-heading">Relationship colors</h2>
        </div>
        <div className="relationship-grid">
          {relationshipTokens.map(([label, token]) => (
            <div className="relationship-swatch" key={token}>
              <span
                aria-hidden="true"
                className="swatch-color"
                style={{ backgroundColor: `var(${token})` }}
              />
              <span className="swatch-label">
                {label}
                <span className="swatch-value">{token}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="components-heading" className="design-section">
        <div>
          <p className="eyebrow">04 / interaction</p>
          <h2 id="components-heading">Primitives</h2>
        </div>
        <div aria-label="Button variants" className="button-row">
          <Button>
            Continue
            <ArrowUpRight aria-hidden="true" size={15} />
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Quiet</Button>
          <Button disabled>Unavailable</Button>
        </div>
        <label className="design-input">
          <span className="swatch-label">Input / focus ring</span>
          <Input
            aria-label="Read-only input sample"
            className="mt-2"
            readOnly
            value="My notes folder"
          />
        </label>
        <div className="primitive-samples">
          <div className="primitive-hint">
            <CircleHelp aria-hidden="true" size={16} />
            Dialogs, tooltips, tabs, and toasts are used in the shell.
          </div>
          <div aria-label="Skeleton component sample" className="skeleton-sample">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-52 max-w-full" />
          </div>
          <span className="primitive-hint">
            <Check aria-hidden="true" size={15} />
            Theme preference persists in this browser.
          </span>
        </div>
      </section>

      <section aria-labelledby="dimensions-heading" className="design-section">
        <div>
          <p className="eyebrow">05 / rhythm</p>
          <h2 id="dimensions-heading">Spacing, shape, and motion</h2>
        </div>
        <div className="metric-grid">
          <div className="metric-card">
            <span className="swatch-label">Spacing</span>
            <span className="metric-value">4 / 8 / 12 / 16 / 24 / 32 px</span>
            <span className="swatch-value">4px base grid</span>
          </div>
          <div className="metric-card">
            <span className="swatch-label">Radii</span>
            <span className="metric-value">8 / 12 / 16 px</span>
            <span className="swatch-value">Soft corners, not pills</span>
          </div>
          <div className="metric-card">
            <span className="swatch-label">Motion</span>
            <span className="metric-value">120–200ms ease-out</span>
            <span className="swatch-value">Reduced motion respected</span>
          </div>
          <div className="metric-card">
            <span className="swatch-label">Elevation</span>
            <span className="metric-value">Soft, layered shadows</span>
            <span className="swatch-value">1px borders</span>
          </div>
        </div>
      </section>
    </div>
  );
}
