# K4 analytics measurement contract

This contract protects the commercial funnel from inflated lead counts and broken campaign attribution.

## Event semantics

| User action | Event before | Event after | Funnel meaning |
| --- | --- | --- | --- |
| Click a thematic service/article CTA | Thematic event, sometimes plus an automatically inferred second thematic event | The declared thematic event only; a contact-channel click is also recorded only when the destination actually opens email, phone, WhatsApp or Telegram | Interest / engagement |
| Click email, phone, WhatsApp or Telegram | `lead_contact_click` | `lead_contact_click` | Contact channel opened; not a confirmed lead |
| First input in the review form | `equipment_form_start` | `lead_form_start` | Form intent |
| Submit the mailto review form | `equipment_form_submit` plus `lead_contact_click` | `lead_form_mailto_open` | Prepared email client opened; not a confirmed send |
| Successful server-side form submission | Not available | Reserved: `lead_form_submit_success` or `generate_lead`, only after a server response confirms success | Confirmed lead |
| Download the checklist PDF | `checklist_pdf_download` plus GA4 Enhanced Measurement `file_download` | Same intentional pair | Resource interest plus file delivery |

K4 currently has no server-side form handler. Do not create `lead_form_submit_success`, `generate_lead`, Opportunity or Revenue events until a real form endpoint and CRM confirmation exist.

## Campaign URL rules

Use `node scripts/campaign_urls.mjs` to generate and validate the campaign URLs in `campaigns/campaign_urls.json`. The helper uses the browser-compatible `URL` and `URLSearchParams` APIs and fails when a browser URL contains literal `amp;utm_`, lacks `utm_source`, duplicates a required parameter, or uses a value outside lowercase `snake_case`.

Required fields are `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content`. Use `utm_term` only when it adds a stable non-personal classification. Never put a person's name, email address, phone number, customer contact, or other personal data in UTM values.

Recommended channel vocabulary:

| Placement | Example |
| --- | --- |
| K4 email/newsletter | `utm_source=k4_email&utm_medium=email` |
| Direct account outreach | `utm_source=direct_outreach&utm_medium=email` |
| YouTube description | `utm_source=youtube&utm_medium=video_description` |
| Organic social | `utm_source=linkedin&utm_medium=organic_social` |
| Paid social | `utm_source=linkedin&utm_medium=paid_social` |
| Partner placement | `utm_source=partner_slug&utm_medium=referral` |

Do not copy an HTML source representation such as `...?utm_source=x&amp;utm_medium=y` into email or messenger text. In HTML markup, `&amp;` can be correct because the browser decodes it. In a plain-text URL or campaign field, use the URL emitted by the helper, where the effective browser parameters are separated by `&`.

For already-distributed links, the browser runtime repairs only actual query parameter names beginning with `amp;utm_`. When one of the two observed campaigns (`existing_fleet_2026` or `data_center_power_2026`) lacks a source after that repair, it adds `utm_source=direct_outreach`. The repaired URL is supplied to GA4 and replaces the visible URL. Correct HTML entities in markup are not rewritten.

## Internal and QA traffic

The site sends `traffic_type=internal` when `k4_internal=1` has enabled the persistent browser flag, and removes it when `k4_internal=0` is visited. Explicit QA sessions (`qa`, `gtm_latency`, or `utm_source=codex_internal_test&utm_medium=qa`) also receive `traffic_type=internal`. Only explicit QA sessions receive `debug_mode=true`; normal internal browsing does not.

After configuration is queued, the visible browser URL removes `k4_internal`, `qa`, `gtm_latency`, and `release`. Real UTM parameters remain in both the GA4 `page_location` and the visible URL.

Manual GA4 setup for property `555147541` (not performed by this repository change):

1. In **Admin → Data collection and modification → Data filters**, create or inspect an **Internal Traffic** filter named `K4 Internal Traffic`. Set operation to **Exclude**, parameter value to `internal`, and state to **Testing**.
2. Create a **Developer Traffic** filter named `K4 QA Debug Traffic`. Set operation to **Exclude** and state to **Testing**.
3. Wait 24–36 hours. In Explore, use rows **Test data filter name** and **Event name**, with **Event count**, and verify both filter names against controlled `k4_internal=1` and QA visits. Also verify a `k4_internal=0` visit is not tagged internal.
4. Only after that evidence is recorded, change both filters from **Testing** to **Active**. Activation affects future data permanently and does not repair historical data.
5. If office/VPN public IP ranges are stable, optionally define them under **Data streams → Web stream → Configure tag settings → Show more → Define internal traffic**, using the same `traffic_type=internal`. Do not guess IP ranges.

Also open **Admin → Data display → Events / Key events** and unmark `lead_contact_click` as a key event. Do not mark `lead_form_mailto_open` as a key event. When a server endpoint can confirm successful delivery, implement `generate_lead` (or `lead_form_submit_success`) and mark only that confirmed event as a key event. Unmarking does not rewrite the four historical key events.

Google's current documentation: [internal traffic filters](https://support.google.com/analytics/answer/10104470), [developer traffic filters](https://support.google.com/analytics/answer/13296662), and [key-event management](https://support.google.com/analytics/answer/13128484).

## Verification cadence

At day 7, compare landing pages and session acquisition for `amp;utm_`, missing `utm_source`, Direct/Email/Unassigned mix, technical query parameters, damaged paths, and counts of `lead_contact_click`, `lead_form_start`, and `lead_form_mailto_open`. Reconcile any actual inbound emails with the analytics sequence; do not infer a lead from a click.

At day 14, repeat the checks with a full two-week cohort, compare campaign and content values against the campaign registry, review filter test evidence, and only then decide whether to activate filters or increase outreach. Opportunity and Revenue remain CRM-owned stages.
