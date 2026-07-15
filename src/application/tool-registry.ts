/**
 * Central tool registry. Transports call {@link registerAllTools} with
 * an SDK-specific callback; adding a tool = one import + one line here.
 */

import type { RegisterTool } from "./tools/_shared/tool.js";
import { checkDatabaseAccessTool } from "./tools/databases/check-database-access.tool.js";
import { downloadDatabaseTool } from "./tools/databases/download-database.tool.js";
import { deleteReportTool } from "./tools/reports/delete-report.tool.js";
import { getReportTool } from "./tools/reports/get-report.tool.js";
import { getSharedReportTool } from "./tools/reports/get-shared-report.tool.js";
import { listReportsTool } from "./tools/reports/list-reports.tool.js";
import { saveReportTool } from "./tools/reports/save-report.tool.js";
import { shareReportTool } from "./tools/reports/share-report.tool.js";
import { listStatFieldsTool } from "./tools/stats/list-stat-fields.tool.js";
import { queryStatsTool } from "./tools/stats/query-stats.tool.js";
import { searchFilterValuesTool } from "./tools/stats/search-filter-values.tool.js";

/** Register every tool of the server through the given callback. */
export function registerAllTools(register: RegisterTool): void {
  // Statistics (read-only)
  register(listStatFieldsTool);
  register(queryStatsTool);
  register(searchFilterValuesTool);
  // Saved & shared reports
  register(listReportsTool);
  register(getReportTool);
  register(saveReportTool);
  register(deleteReportTool);
  register(shareReportTool);
  register(getSharedReportTool);
  // IP / UA reference databases (read-only)
  register(checkDatabaseAccessTool);
  register(downloadDatabaseTool);
}
