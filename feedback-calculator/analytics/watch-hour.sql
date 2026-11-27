-- Last complete UTC hour. A returning session may have events without opening in this hour.
WITH bounds AS (SELECT CAST(unixepoch()/3600 AS INTEGER)-1 AS h),
activity AS (
  SELECT count(DISTINCT sid) AS active_sessions,
    count(*) FILTER (WHERE ordinal=0) AS opens,
    count(*) FILTER (WHERE ordinal=1) AS starts,
    count(*) FILTER (WHERE ordinal=2) AS first_calculations,
    count(*) FILTER (WHERE ordinal BETWEEN 3 AND 33) AS recalculations,
    count(*) FILTER (WHERE ordinal BETWEEN 2 AND 33) AS all_calculations,
    count(*) FILTER (WHERE ordinal=40) AS sessions_requesting_print
  FROM bounds LEFT JOIN calculator_events ON is_test=0 AND hour_utc=h
), cohort AS (
  SELECT count(*) AS opened, count(c.sid) AS converted_by_hour_end
  FROM bounds JOIN calculator_events o ON o.is_test=0 AND o.hour_utc=h AND o.ordinal=0
  LEFT JOIN calculator_events c ON c.sid=o.sid AND c.is_test=0 AND c.ordinal=2 AND c.hour_utc=h
)
SELECT datetime(h*3600,'unixepoch') AS start_utc, activity.*,
  round(100.0*converted_by_hour_end/nullif(opened,0),1) AS open_to_calculation_pct
FROM bounds,activity,cohort;
