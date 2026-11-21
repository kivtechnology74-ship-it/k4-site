-- Bind ?1 = inclusive UTC start, ?2 = exclusive UTC end.
-- Session stages are ordered in the same session. Production reports exclude internal traffic,
-- QA, demos and probable automation. PDF click counts are events; scenario rates are deduplicated.
WITH eligible_events AS (
  SELECT * FROM calculator_events
  WHERE traffic_class = 'production' AND internal_traffic = 0
    AND profile_type != 'demo' AND created_at >= ?1 AND created_at < ?2
), session_times AS (
  SELECT session_id,
    MIN(CASE WHEN event_name = 'calculator_page_view' THEN created_at END) AS page_view_at,
    MIN(CASE WHEN event_name = 'calculator_started' THEN created_at END) AS started_at,
    MIN(CASE WHEN event_name = 'calculator_model_selected' THEN created_at END) AS model_selected_at,
    MIN(CASE WHEN event_name = 'calculator_result_completed' THEN created_at END) AS completed_at
  FROM eligible_events
  GROUP BY session_id
), sequential_sessions AS (
  SELECT session_id,
    page_view_at IS NOT NULL AS traffic,
    page_view_at IS NOT NULL AND started_at > page_view_at AS started,
    page_view_at IS NOT NULL AND started_at > page_view_at
      AND model_selected_at > started_at AS model_selected,
    page_view_at IS NOT NULL AND started_at > page_view_at
      AND model_selected_at > started_at AND completed_at > model_selected_at AS completed
  FROM session_times
), completed_scenarios AS (
  SELECT calc_id, MIN(created_at) AS completed_at
  FROM eligible_events
  WHERE event_name = 'calculator_result_completed'
  GROUP BY calc_id
), pdf_scenarios AS (
  SELECT DISTINCT e.calc_id
  FROM eligible_events e JOIN completed_scenarios c ON c.calc_id = e.calc_id
  WHERE e.event_name = 'calculator_pdf_clicked' AND e.created_at >= c.completed_at
), pdf_click_events AS (
  SELECT COUNT(*) AS pdf_click_events
  FROM eligible_events e JOIN completed_scenarios c ON c.calc_id = e.calc_id
  WHERE e.event_name = 'calculator_pdf_clicked' AND e.created_at >= c.completed_at
), stored_leads AS (
  SELECT l.id, l.calc_id, l.qualification_status
  FROM site_leads l JOIN calculator_completions c ON c.calc_id = l.calc_id
  WHERE l.calc_id IS NOT NULL AND l.created_at >= ?1 AND l.created_at < ?2
    AND c.traffic_class = 'production' AND c.internal_traffic = 0
), counts AS (
  SELECT
    (SELECT COUNT(*) FROM sequential_sessions WHERE traffic) AS traffic_sessions,
    (SELECT COUNT(*) FROM sequential_sessions WHERE started) AS started_sessions,
    (SELECT COUNT(*) FROM sequential_sessions WHERE model_selected) AS model_selected_sessions,
    (SELECT COUNT(*) FROM sequential_sessions WHERE completed) AS completed_sessions,
    (SELECT COUNT(*) FROM completed_scenarios) AS completed_scenarios,
    (SELECT pdf_click_events FROM pdf_click_events) AS pdf_click_events,
    (SELECT COUNT(*) FROM pdf_scenarios) AS completed_scenarios_with_pdf,
    (SELECT COUNT(*) FROM stored_leads) AS leads_stored,
    (SELECT COUNT(DISTINCT calc_id) FROM stored_leads) AS completed_scenarios_with_lead,
    (SELECT COUNT(*) FROM stored_leads WHERE qualification_status = 'qualified') AS qualified_leads,
    (SELECT COUNT(DISTINCT calc_id) FROM stored_leads WHERE qualification_status = 'qualified') AS qualified_scenarios
)
SELECT *,
  ROUND(100.0 * started_sessions / NULLIF(traffic_sessions, 0), 1) AS traffic_to_started_pct,
  ROUND(100.0 * model_selected_sessions / NULLIF(started_sessions, 0), 1) AS started_to_model_selected_pct,
  ROUND(100.0 * completed_sessions / NULLIF(model_selected_sessions, 0), 1) AS model_selected_to_completed_pct,
  ROUND(100.0 * completed_scenarios_with_pdf / NULLIF(completed_scenarios, 0), 1) AS completed_to_pdf_scenario_pct,
  ROUND(100.0 * completed_scenarios_with_lead / NULLIF(completed_scenarios, 0), 1) AS completed_to_lead_scenario_pct,
  ROUND(100.0 * qualified_leads / NULLIF(leads_stored, 0), 1) AS stored_lead_to_qualified_pct
FROM counts;

-- Model popularity: event clicks are selections; completed scenarios are deduplicated by calc_id.
SELECT brand, model_id, model_name,
  COUNT(DISTINCT CASE WHEN event_name = 'calculator_model_selected' THEN event_id END) AS model_selection_events,
  COUNT(DISTINCT CASE WHEN event_name = 'calculator_result_completed' THEN calc_id END) AS completed_scenarios,
  COUNT(CASE WHEN event_name = 'calculator_pdf_clicked' THEN 1 END) AS pdf_click_events
FROM calculator_events
WHERE traffic_class = 'production' AND internal_traffic = 0
  AND profile_type != 'demo' AND created_at >= ?1 AND created_at < ?2
GROUP BY brand, model_id, model_name
ORDER BY model_selection_events DESC, completed_scenarios DESC;

-- Segmentation audit: keep excluded traffic visible for QA and monitoring.
SELECT traffic_class, internal_traffic, profile_type, event_name, COUNT(*) AS events
FROM calculator_events
WHERE created_at >= ?1 AND created_at < ?2
GROUP BY traffic_class, internal_traffic, profile_type, event_name
ORDER BY traffic_class, internal_traffic, profile_type, event_name;
