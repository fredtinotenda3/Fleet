// app/(protected)/transport-cost/report/page.tsx
//
// PRODUCTION FIX (Olivine live readiness pass, Oct 2026 cutover). This
// was the old standalone O4 "Transport Cost Report" screen (Business
// Stream -> Vehicle/Transporter -> month picker). The client's own
// instruction: "The Command Centre is now the primary transport-cost
// intelligence experience... [this page] has already been removed. Do
// NOT recreate it... The current architecture should have one clear
// transport-cost intelligence experience."
//
// The in-app nav no longer links here (nav.config.ts's 'transport-cost'
// entry now points at /transport-cost/command-centre directly), so this
// route is unreachable through normal navigation. It's kept as a
// server-side redirect -- rather than deleting TransportCostReportPage.tsx,
// its API routes, or the shared report service underneath it -- for two
// reasons: (1) reversibility (ABSOLUTE RULE: preserve reversibility for
// every consequential decision) in case Olivine or a future slice still
// wants that Stream->Vehicle drill-down view; (2) TransportCostReportService
// is NOT exclusive to this page -- the Command Centre's own dimension
// breakdowns are built on the same service (see
// transport-cost-report.service.ts), so nothing downstream of this
// route was touched. Anyone who had this URL bookmarked lands on the
// Command Centre instead of a dead link or a duplicate experience.
import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/transport-cost/command-centre');
}
