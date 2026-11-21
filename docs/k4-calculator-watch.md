# K4 Calculator Watch — lead alert rules

Use the “Monitor candidates” query at the end of `reports/calculator-funnel.sql` for commercial lead alerts.

Alert only when all of these conditions hold:

- A saved `site_leads` row has a valid `calc_id`.
- That ID joins to `calculator_completions.calc_id`, with completion at or before the lead submission.
- The completion is marked `traffic_class = 'production'` and `internal_traffic = 0`.
- Demo profiles are excluded. QA and probable automation are excluded because they do not have production traffic classification.
- A source URL by itself, including `/gpu-estimate-hybrid-ru/`, is never evidence of a calculator lead.

Use `site_leads.id` as the stable idempotency key. Before notifying, compare each candidate ID against the monitor's persisted alert history; notify only IDs not previously alerted. Retrying a query or a monitor run must not notify on the same ID again.

Do not remove or edit existing lead rows. Report unmatched or excluded submissions only as diagnostics, never as commercial calculator leads.

The query uses inclusive UTC `?1` and exclusive UTC `?2` timestamps, matching the main funnel report.
