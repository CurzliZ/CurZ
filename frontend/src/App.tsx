import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";

import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/useTheme";
import { VaultGate } from "@/pages/VaultGate";
import { DesignPage } from "@/pages/DesignPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ReviewPage } from "@/pages/ReviewPage";
import { TrustReportPage } from "@/pages/TrustReportPage";
import {
  HomePage,
  NotesPage,
} from "@/pages/WorkspacePages";

const BrainPage = lazy(() =>
  import("@/pages/BrainPage").then((module) => ({
    default: module.BrainPage,
  })),
);

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<TrustReportPage />} path="trust" />
            <Route element={<VaultGate />}>
              <Route element={<AppShell />}>
                <Route element={<HomePage />} index />
                <Route element={<NotesPage />} path="notes" />
                <Route
                  element={
                    <Suspense fallback={<div aria-busy="true" className="brain-route-loading">Loading Brain…</div>}>
                      <BrainPage />
                    </Suspense>
                  }
                  path="brain"
                />
                <Route element={<ReviewPage />} path="review" />
                <Route element={<SettingsPage />} path="settings" />
                <Route element={<DesignPage />} path="dev/design" />
                <Route element={<Navigate replace to="/" />} path="*" />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
