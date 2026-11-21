-- Bind ?1 = inclusive UTC start, ?2 = exclusive UTC end.
-- All funnel stages use production only. QA, demos and probable automation stay separate.
WITH event_counts AS (
  SELECT
    COUNT(DISTINCT CASE WHEN event_name = 'calculator_page_view' THEN session_id END) AS traffic_sessions,
    COUNT(DISTINCT CASE WHEN event_name = 'calculator_started' THEN calc_id END) AS started,
    COUNT(DISTINCT CASE WHEN event_name = 'calculator_model_selected' THEN calc_id END) AS model_selected,
    COUNT(DISTINCT CASE WHEN event_name = 'calculator_result_completed' THEN calc_id END) AS completed,
    COUNT(CASE WHEN event_name = 'calculator_pdf_clicked' THEN 1 END) AS pdf_clicks
  FROM calculator_events
  WHERE traffic_class = 'production' AND created_at >= ?1 AND created_at < ?2
), lead_counts AS (
  SELECT
    COUNT(DISTINCT id) AS lead_stored,
    COUNT(DISTINCT CASE WHEN qualification_status = 'qualified' THEN id END) AS qualified_lead
  FROM site_leads
  WHERE calc_id IS NOT NULL AND created_at >= ?1 AND created_at < ?2
)
SELECT event_counts.*, lead_counts.*,
  ROUND(100.0 * started / NULLIF(traffic_sessions, 0), 1) AS traffic_to_started_pct,
  ROUND(100.0 * model_selected / NULLIF(started, 0), 1) AS started_to_model_selected_pct,
  ROUND(100.0 * completed / NULLIF(model_selected, 0), 1) AS model_selected_to_completed_pct,
  ROUND(100.0 * pdf_clicks / NULLIF(completed, 0), 1) AS completed_to_pdf_click_pct,
  ROUND(100.0 * lead_stored / NULLIF(completed, 0), 1) AS completed_to_lead_stored_pct,
  ROUND(100.0 * qualified_lead / NULLIF(lead_stored, 0), 1) AS lead_stored_to_qualified_pct
FROM event_counts CROSS JOIN lead_counts;

-- Model popularity: selections and completed scenarios in the same UTC interval.
SELECT model_id, model_name,
  COUNT(DISTINCT CASE WHEN event_name = 'calculator_model_selected' THEN calc_id END) AS selections,
  COUNT(DISTINCT CASE WHEN event_name = 'calculator_result_completed' THEN calc_id END) AS completed
FROM calculator_events
WHERE traffic_class = 'production' AND created_at >= ?1 AND created_at < ?2
  AND profile_type != 'demo'
GROUP BY model_id, model_name
ORDER BY selections DESC, completed DESC;

-- Segmentation audit: keep QA, demos and probable automation visible outside the funnel.
SELECT traffic_class, event_name, COUNT(*) AS events
FROM calculator_events
WHERE created_at >= ?1 AND created_at < ?2
GROUP BY traffic_class, event_name
ORDER BY traffic_class, event_name;
