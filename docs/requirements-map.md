# Requirement mapping — seven WallPanels source documents

The code-based templates prioritize the *Wallpanels Installer Checklist NEW* and reference complementary training documents. This file does not change company policy; review and obtain PM approval of digital interpretations before production use.

| Source | Mandatory source requirement | App mapping |
| --- | --- | --- |
| `Wallpanels_Installer_Checklist_NEW (1).pdf`, p.1 | Without photos **and videos** before and after, work is not complete; send on the same day | Required `before_video`, `after_video`, Before/After images; cannot submit final before presence; daily reports |
| Same, p.1 | Branded dress, site prep, detector, charged phone | `preflight` checklist |
| Same, p.1–2 | Flags/signs on arrival and in first BEFORE report; images of floor, walls, furniture, overview, existing damage | `before` media categories |
| Same, p.2 | Floor/furniture protected; use detector before drilling | `protection` photos and checks |
| Same, p.2 | Clean and safe end of **each** working day | Date-scoped `daily_reports`, image and four checks |
| Same, p.3 | Final installation, lighting, debris removal, vacuum, protective film removed | `installed`, `cleanup` checklists & photos |
| `WP-TRAIN-03`, p.2–3 | Inspect approved documents, protect property, do not improvise; report issues and wait for PM | Preparation and protection checks; issue workflow; no auto-approval of changes |
| `WP-TRAIN-04`, p.2–3 | Professional conduct, no price promises, report damage/photo, end-of-day cleanup | Checks, issue types and daily report; conduct remains an HR/training matter |
| `WP-TRAIN-05`, p.2–3 | Materials, hardware, drawings, dimensions, walkthrough, photos, client satisfaction/refusal | `preflight`, `handover`, client outcome and final submission gate |
| `WP-TRAIN-06`, p.2–4 | Panels/doors/cabinets/lighting/finishes, close-ups, self-inspection before client, documentation and signature | `installed` checklist, `handover`, final photo categories |
| `WP-TRAIN-02`, p.2–3 | PM tracks risks, change orders approved, photos and client confirmation before closing | PM-only review, issues, N/A approval, client confirmation, role segregation |
| `WP-TRAIN-01`, p.2–3 | Time, quality, responsibility, risk management | Owner, schedule, progress and review statuses |

## Decisions requiring owner/PM sign-off

1. The checklist document says photos/videos must be **sent to PM on day captured**. App records same-day uploads and notifies PM for daily submission; PM should determine whether **every single new file** needs an individual Telegram notification.
2. Customer signature is recorded using a **photo of signed form**, or a documented refusal. This is not legally equivalent to verified electronic signing. Approval workflow should be confirmed with management.
3. PM can approve some project-specific photo requirements as N/A with a reason. The source documents do not explicitly authorize such exceptions for BEFORE/AFTER video. **The app disallows N/A** for before/after videos and flags. If management decides to relax these requirements, record that decision formally before changing the code.
4. Project-level stage completion requires a report for **every recorded workday**, but it cannot detect an unrecorded workday automatically. PM should set working dates and check daily report coverage.
5. Daily media storage, data retention, liability, deletion and evidence policy must be approved. No automated media deletion is included.
