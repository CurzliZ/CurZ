import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  section: string;
  title: string;
  description: string;
  action: string;
  reason: string;
  icon: LucideIcon;
}

export function EmptyState({
  section,
  title,
  description,
  action,
  reason,
  icon: Icon,
}: EmptyStateProps) {
  const reasonId = `${section.toLowerCase()}-action-reason`;

  return (
    <div className="empty-page">
      <section className="empty-state" aria-labelledby="page-title">
        <div className="empty-art" aria-hidden="true">
          <span className="empty-orbit" />
          <span className="empty-orbit-dot" />
          <Icon className="empty-art-icon" size={24} strokeWidth={1.6} />
        </div>
        <p className="eyebrow">{section} / coming into focus</p>
        <h1 className="empty-title" id="page-title">
          {title}
        </h1>
        <p className="empty-description">{description}</p>
        <div className="empty-action-group">
          <Button disabled aria-describedby={reasonId} className="min-h-10 px-4">
            {action}
            <ArrowUpRight aria-hidden="true" size={15} />
          </Button>
          <p className="action-reason" id={reasonId}>
            {reason}
          </p>
        </div>
      </section>
    </div>
  );
}
